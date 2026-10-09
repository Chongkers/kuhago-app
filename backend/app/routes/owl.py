"""Ask the owl: Ollama running on this machine chats about one event, suggests the moments an event's photos
really show, and describes a new moment in words CLIP can match."""
import base64
import json
import logging
import re
import urllib.error
import urllib.request
from collections import Counter
from contextlib import closing
from pathlib import Path
from typing import Literal

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import config, db
from app.routes.coverage import get_coverage
from app.routes.search import get_search
from ml import clip_engine

log = logging.getLogger(__name__)
router = APIRouter()


def _ollama(path: str, body: dict | None = None, timeout: float = config.OLLAMA_TIMEOUT) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(config.OLLAMA_URL + path, data, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


class Message(BaseModel):
    role: Literal["user", "assistant"]  # the system prompt is ours alone
    content: str


class AskIn(BaseModel):
    messages: list[Message] = Field(min_length=1)
    model: str | None = None


@router.get("/owl/status")
def owl_status():
    out = {"connected": False, "models": [], "default_model": config.OLLAMA_MODEL, "url": config.OLLAMA_URL}
    try:
        tags = _ollama("/api/tags", timeout=config.OLLAMA_STATUS_TIMEOUT)
    except (urllib.error.URLError, OSError, ValueError):
        return out
    return {**out, "connected": True, "models": [m["name"] for m in tags.get("models", []) if "name" in m]}


def _facts(event_id: int) -> tuple[str, list[str], int]:
    """What the assistant is told about an event, the moments already on its list, and how many photos and
    videos it has."""
    with closing(db.connect()) as con:
        ev = con.execute("SELECT mode, name, event_type, date, venue FROM events WHERE id = ?", (event_id,)).fetchone()
        if not ev:
            raise HTTPException(404, "event not found")
        media = con.execute(
            "SELECT kind, moment, roll, is_highlight, taken_at, emb_index FROM media WHERE event_id = ?", (event_id,)
        ).fetchall()
    coverage = get_coverage(event_id)
    photos = sum(m["kind"] == "photo" for m in media)
    unsorted = sum(m["moment"] in (None, config.UNSORTED) for m in media)
    counts = [f"{c['moment']}: {c['count']}" for c in coverage] + [f"{config.UNSORTED}: {unsorted}"]
    missed = [c["moment"] for c in coverage if c["required"] and not c["covered"]]
    must = [c["moment"] for c in coverage if c["required"]]
    details = ", ".join(f"{k}: {ev[k]}" for k in ("event_type", "date", "venue") if ev[k])
    taken = sorted(m["taken_at"] for m in media if m["taken_at"])
    rows = [m["emb_index"] for m in media if m["emb_index"] is not None]
    tags = _top_tags(db.load_embeddings(event_id)[rows]) if rows else []
    lines = [
        "You are the assistant in KuhaGo, a photo organizer that runs offline on the user's laptop.",
        "You are talking with a professional photographer about a client's event: be brief and practical."
        if ev["mode"] == "pro"
        else "You are talking with someone sorting the photos of their own family or friends' event: be warm and simple.",
        "Be helpful and specific: name the moments and numbers from the facts below. Write plain text: no markdown, no headings, no asterisks."
        " Reply in the language the user writes in (English, Filipino or Taglish).",
        "You can't see the photos yourself: go by the facts below, and never make up what is in a photo, a name"
        " or a number. If the facts don't answer the question, say so. You may write captions, notes, summaries"
        " and tips for shooting or sorting. You can't move, rename, delete or copy files.",
        "In this chat the user can also ask KuhaGo to find photos (\"find the cake cutting\") or to suggest moments"
        " to add (\"suggest themes\"). Point them there when it helps.",
        f"Event: {ev['name']}" + (f" ({details})" if details else ""),
        f"In the event: {photos} photos and {len(media) - photos} videos",
        "Photos and videos per moment (how KuhaGo sorted them; Unsorted fit no moment): " + ", ".join(counts),
        "Must-have moments: " + (", ".join(must) or "none"),
        "Missed moments: " + (", ".join(missed) or "none"),
        f"Highlights picked: {sum(bool(m['is_highlight']) for m in media)}",
        f"Videos with talking: {sum(m['roll'] == 'A' for m in media)}, scenery videos: {sum(m['roll'] == 'B' for m in media)}",
    ]
    if taken:
        lines.append(f"Taken between {taken[0]} and {taken[-1]}")
    if tags:
        lines.append(
            "What an image model sees most often in them (with how many). This is what the photos really show, even"
            " when it doesn't fit the kind of event: " + "; ".join(tags)
        )
    return "\n".join(lines), [c["moment"] for c in coverage], len(media)


def _chat(model: str, messages: list[dict], timeout: float = config.OLLAMA_TIMEOUT, **options) -> str:
    """One answer from Ollama. Every way it can fail becomes a plain sentence for the UI."""
    slow = HTTPException(504, "KuhaGo took too long to answer. Try again, or pick a smaller model.")
    try:
        opts = {**config.OLLAMA_OPTIONS, **(options.pop("options", None) or {})}
        body = {"model": model, "messages": messages, "stream": False, "keep_alive": config.OLLAMA_KEEP_ALIVE, "options": opts, **options}
        return _ollama("/api/chat", body, timeout=timeout)["message"]["content"]
    except urllib.error.HTTPError as err:  # Ollama is up but refused
        if err.code == 404:
            raise HTTPException(502, f"The model {model} isn't on this laptop yet. Run: ollama pull {model}") from err
        raise HTTPException(502, "Ollama couldn't answer. Try again, or pick another model.") from err
    except TimeoutError as err:
        raise slow from err
    except urllib.error.URLError as err:
        if isinstance(err.reason, TimeoutError):
            raise slow from err
        raise HTTPException(503, "Ollama isn't running on this laptop. Start Ollama, then try again.") from err
    except (OSError, ValueError, KeyError) as err:
        raise HTTPException(502, "Ollama couldn't answer. Try again, or pick another model.") from err


def _json_reply(text: str) -> dict:
    """The object in a model's reply; small models wrap it in prose or code fences even when told not to."""
    try:
        out = json.loads(text[text.index("{") : text.rindex("}") + 1])
    except ValueError:  # no braces, or not JSON between them
        return {}
    return out if isinstance(out, dict) else {}


def _captions(raw) -> list[str]:
    texts = [t.strip() for t in raw if isinstance(t, str) and t.strip()] if isinstance(raw, list) else []
    return list(dict.fromkeys(texts))[: config.OWL_PROMPTS_PER_MOMENT]


_VISIBLE = (
    "Captions are for an image search model that only knows what things look like. Each one is a short English"
    " phrase saying what is literally visible in such a photo: people, objects, actions, the place. Never use"
    " names of people, places or traditions."
)


def _captions_schema(most: int) -> dict:
    return {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": most}


def _json_chat(model: str, messages: list[dict], schema: dict, **kwargs) -> dict:
    """A reply held to a JSON schema. The schema and the token cap bound its length: asked only for "JSON",
    a small model sometimes lists twice what it was told to and runs past the timeout."""
    reply = _chat(model, messages, format=schema, options={"num_predict": config.OWL_JSON_MAX_TOKENS}, **kwargs)
    return _json_reply(reply)


def _moments_schema() -> dict:
    return {
        "type": "array",
        "maxItems": config.OWL_MAX_SUGGESTIONS,
        "items": {
            "type": "object",
            "properties": {"moment": {"type": "string"}, "prompts": _captions_schema(config.OWL_SUGGESTION_PROMPTS)},
            "required": ["moment", "prompts"],
        },
    }


def _new_names(raw, have: list[str]) -> list[str]:
    """The model's moment names that are usable: not blank, and not on the list (or repeated) already."""
    taken = {m.casefold() for m in [*have, config.UNSORTED]}
    out = []
    for name in raw if isinstance(raw, list) else []:
        name = name.strip()[: config.MOMENT_NAME_MAX].strip() if isinstance(name, str) else ""
        if name and name.casefold() not in taken:
            taken.add(name.casefold())
            out.append(name)
    return out[: config.OWL_MAX_SUGGESTIONS]


def _new_moments(raw, have: list[str]) -> list[dict]:
    """The model's moments that are usable: named, captioned, and not on the list (or repeated) already."""
    taken = {m.casefold() for m in [*have, config.UNSORTED]}
    out = []
    for m in raw if isinstance(raw, list) else []:
        name = m.get("moment") if isinstance(m, dict) else None
        name = name.strip()[: config.MOMENT_NAME_MAX].strip() if isinstance(name, str) else ""
        prompts = _captions(m.get("prompts")) if name else []
        if prompts and name.casefold() not in taken:
            taken.add(name.casefold())
            out.append({"moment": name, "prompts": prompts})
    return out[: config.OWL_MAX_SUGGESTIONS]


def visible_prompts(moment: str, event_type: str | None, model: str | None) -> list[str]:
    """CLIP prompts for a moment the user typed. With a model, Ollama turns the name into what such a photo
    shows ("18 Roses" -> a young woman dancing with a man holding a rose); without one, or when Ollama can't
    answer in time, the name itself is the prompt. Adding a moment never fails because of the owl."""
    plain = [f"a photo of {moment.lower()}"]
    if not model:
        return plain
    system = (
        f"{_VISIBLE} Write {config.OWL_PROMPTS_PER_MOMENT} captions for the moment the user names."
        ' Reply with JSON only: {"prompts": ["caption", "caption"]}'
    )
    user = f"Moment: {moment}" + (f"\nKind of event: {event_type}" if event_type else "")
    schema = {
        "type": "object",
        "properties": {"prompts": _captions_schema(config.OWL_PROMPTS_PER_MOMENT)},
        "required": ["prompts"],
    }
    try:
        reply = _json_chat(
            model, [{"role": "system", "content": system}, {"role": "user", "content": user}], schema,
            timeout=config.OLLAMA_PROMPT_TIMEOUT,
        )
    except HTTPException as err:
        log.warning("owl could not describe %r: %s", moment, err.detail)
        return plain
    return _captions(reply.get("prompts")) or plain


def _can_see(model: str) -> bool:
    """Whether the model takes images. Not being able to tell means no: tags alone still work."""
    try:
        return "vision" in _ollama("/api/show", {"model": model}, timeout=config.OLLAMA_STATUS_TIMEOUT).get("capabilities", [])
    except (urllib.error.URLError, OSError, ValueError, AttributeError):
        return False


def _top_tags(emb: np.ndarray) -> list[str]:
    """The scene tags CLIP picks most often over the event's media, as "tag (N)" lines."""
    if not len(emb) or not config.SCENE_TAGS:
        return []
    best = (emb @ clip_engine.embed_texts(config.SCENE_TAGS).T).argmax(axis=1)
    return [f"{config.SCENE_TAGS[i]} ({n})" for i, n in Counter(best.tolist()).most_common(config.OWL_TOP_TAGS)]


def _sample(paths: list[str]) -> list[str]:
    """A few previews spread over the event, base64 for Ollama. Unreadable ones are left out."""
    step = max(1, len(paths) // config.OWL_SAMPLE_PHOTOS)
    out = []
    for p in paths[::step][: config.OWL_SAMPLE_PHOTOS]:
        try:
            out.append(base64.b64encode(Path(p).read_bytes()).decode())
        except OSError as e:
            log.warning("skip sample %s: %s", p, e)
    return out


class SuggestIn(BaseModel):
    model: str | None = None


@router.post("/events/{event_id}/suggest_moments")
def suggest_moments(event_id: int, body: SuggestIn):
    """Moments this event's photos really show, for the user to add to the checklist. Nothing is saved here.
    Any model gets what CLIP sees in the photos; a model that can see also gets a few of the photos."""
    model = body.model or config.OLLAMA_MODEL
    with closing(db.connect()) as con:
        ev = con.execute("SELECT name, event_type FROM events WHERE id = ?", (event_id,)).fetchone()
        if not ev:
            raise HTTPException(404, "event not found")
        have = [r["moment"] for r in con.execute("SELECT moment FROM shot_items WHERE event_id = ? ORDER BY id", (event_id,))]
        media = con.execute(
            "SELECT emb_index, preview_path FROM media WHERE event_id = ? AND emb_index IS NOT NULL ORDER BY taken_at, id",
            (event_id,),
        ).fetchall()
    if not media:
        raise HTTPException(400, "Add some photos first. KuhaGo suggests moments from what's in them.")
    tags = _top_tags(db.load_embeddings(event_id)[[m["emb_index"] for m in media]])
    images = _sample([m["preview_path"] for m in media if m["preview_path"]]) if _can_see(model) else []

    system = (
        "You help sort the photos of one event in KuhaGo, an offline photo organizer. Work out what really happened"
        " and suggest the moments the photos should be sorted into. Trust what is in the photos over the event's"
        " name or kind: the photos may show something else entirely."
        f" Suggest at most {config.OWL_MAX_SUGGESTIONS} moments that are not on the list yet. A moment's name is 1 to 4"
        f" words. Give each moment {config.OWL_SUGGESTION_PROMPTS} captions. {_VISIBLE}"
        ' Reply with JSON only: {"moments": [{"moment": "Name", "prompts": ["caption", "caption"]}]}'
    )
    user = "\n".join([
        f"Event: {ev['name']}" + (f" (kind: {ev['event_type']})" if ev["event_type"] else ""),
        "Moments already on the list: " + (", ".join(have) or "none"),
        f"What an image model sees most often in the {len(media)} photos and videos (with how many):",
        *(f"- {t}" for t in tags),
        *(["A few of the photos are attached."] if images else []),
    ])
    message = {"role": "user", "content": user, **({"images": images} if images else {})}
    schema = {"type": "object", "properties": {"moments": _moments_schema()}, "required": ["moments"]}
    out = _new_moments(_json_chat(model, [{"role": "system", "content": system}, message], schema).get("moments"), have)
    if not out:
        raise HTTPException(502, "KuhaGo didn't come up with any new moments. Try again, or pick another model.")
    return {"moments": out, "saw_photos": bool(images)}


# What the user's message has to mention for the reply to carry moments to add, or photos to show.
_WANTS_MOMENTS = re.compile(
    r"\b(theme|subject|moment|categor|album|folder|shot ?list|checklist|sort|organi[sz]e|group (them|the|these|my)|add|tema|kategorya|ayusin|idagdag)", re.I
)
_WANTS_PHOTOS = re.compile(
    r"\b(find|show|search|look (for|up)|(pa)?hanap\w*|i?pakita|nasaan|saan (ang|yung|ung)|where (is|are)|which (photos?|pictures?|shots?)|(photos?|pictures?|shots?) (of|with))\b", re.I
)
_FIND_LEAD = re.compile(
    r"^\W*(please\s+|pa\s*|can you\s+|could you\s+)?(find|show|search( for)?|look (for|up)|where (is|are)|hanapin|hanap|i?pakita|nasaan)"
    r"\s+((me|mo|nga|naman|po)\s+)*((all|any|the|my|some|ang|yung|ung|mga)\s+)*"
    r"((photos?|pictures?|pics|shots?|videos?|litrato)\s+)?((of|with|where|that show|ng|sa)\s+)?",
    re.I,
)


def _matching_photos(event_id: int, text: str) -> list[dict]:
    """The event's media CLIP ranks closest to what the user asked to see."""
    query = _FIND_LEAD.sub("", text).strip(" ?.!") or text
    return get_search(query, event_id)[: config.OWL_FIND_PHOTOS]


@router.post("/events/{event_id}/ask")
def ask(event_id: int, body: AskIn):
    """One reply about an event. When the user asks for themes or moments it also carries names they can add
    with a click; when they ask to find something, it is the photos CLIP matches. Nothing is saved here."""
    model = body.model or config.OLLAMA_MODEL
    facts, have, media = _facts(event_id)
    history = [m.model_dump() for m in body.messages[-config.OWL_HISTORY_MESSAGES :]]
    while len(history) > 1 and sum(len(m["content"]) for m in history) > config.OWL_HISTORY_CHARS:
        history.pop(0)  # long replies would push the facts out of num_ctx
    asked = body.messages[-1].content if body.messages[-1].role == "user" else ""

    wants_moments = bool(_WANTS_MOMENTS.search(asked))
    photos = _matching_photos(event_id, asked) if _WANTS_PHOTOS.search(asked) and not wants_moments else []
    if photos:
        # the search is the answer. A model that can't see the photos only apologises for that or guesses at them.
        reply = "These are the closest matches KuhaGo's image search found. The best ones come first, so check the last few."
        return {"reply": reply, "moments": [], "photos": photos}
    if not wants_moments:
        facts += "\nAnswer in two to four short sentences unless the user asks for more."
        return {"reply": _chat(model, [{"role": "system", "content": facts}, *history]), "moments": [], "photos": []}

    # names only: the captions CLIP needs are written when a moment is added (visible_prompts). Asked for both
    # at once, a small model fills the captions with filler.
    # A gig that hasn't been shot yet has nothing to look at: its list is planned from the kind of event.
    basis = (
        "Go by what the image model sees in the photos, not by the event's name or kind: the photos may show"
        " something else. If the user asks for a list for a kind of event, go by that kind of event."
        if media
        else "There are no photos yet, so go by the event's name and kind, or the kind of event the user names:"
        " list what is worth photographing at such an event."
    )
    facts += (
        "\nMoments are the themes or subjects the photos are sorted into; a shot list is a list of moments. The user"
        ' sees the names you put in "moments" as a list and adds them with one click. Put there at most'
        f" {config.OWL_MAX_SUGGESTIONS} new names that answer their last message: every name you suggest goes in"
        f' "moments", never only in "reply". {basis} Leave out moments that are already on the list. If the user'
        ' named one, use their name. A name is 1 to 4 words. In "reply", say in one or two sentences what you'
        ' suggest and why. Reply with JSON only: "moments" is the list of names, "reply" is your sentences.'
    )
    # the list comes first in the reply, so the sentences are about the names that were really listed
    names = {"type": "array", "items": {"type": "string"}, "minItems": 1, "maxItems": config.OWL_MAX_SUGGESTIONS}
    schema = {"type": "object", "properties": {"moments": names, "reply": {"type": "string"}}, "required": ["reply", "moments"]}
    out = _json_chat(model, [{"role": "system", "content": facts}, *history], schema)
    moments = _new_names(out.get("moments"), have)
    reply = out["reply"].strip() if isinstance(out.get("reply"), str) else ""
    if not reply:
        reply = "Here are some you could add." if moments else "I couldn't come up with any new ones. Try asking another way."
    return {"reply": reply, "moments": moments, "photos": []}
