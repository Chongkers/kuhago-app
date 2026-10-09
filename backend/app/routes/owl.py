"""Ask the owl: Ollama running on this machine chats about one event, suggests the moments an event's photos
really show, and describes a new moment in words CLIP can match."""
import base64
import json
import logging
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


def _facts(event_id: int) -> str:
    with closing(db.connect()) as con:
        ev = con.execute("SELECT name, event_type, date, venue FROM events WHERE id = ?", (event_id,)).fetchone()
        if not ev:
            raise HTTPException(404, "event not found")
        unsorted = con.execute(
            "SELECT COUNT(*) FROM media WHERE event_id = ? AND (moment IS NULL OR moment = ?)", (event_id, config.UNSORTED)
        ).fetchone()[0]
    coverage = get_coverage(event_id)
    counts = [f"{c['moment']}: {c['count']}" for c in coverage] + [f"{config.UNSORTED}: {unsorted}"]
    missed = [c["moment"] for c in coverage if c["required"] and not c["covered"]]
    details = ", ".join(f"{k}: {ev[k]}" for k in ("event_type", "date", "venue") if ev[k])
    return "\n".join([
        "You are the owl in KuhaGo, a photo organizer that runs offline on the user's laptop.",
        "Answer in short, plain sentences. Only use the facts below; if they don't answer the question, say so.",
        "You can't move, rename, delete or copy files.",
        f"Event: {ev['name']}" + (f" ({details})" if details else ""),
        "Photos and videos per moment: " + ", ".join(counts),
        "Missed moments: " + (", ".join(missed) or "none"),
    ])


def _chat(model: str, messages: list[dict], timeout: float = config.OLLAMA_TIMEOUT, **options) -> str:
    """One answer from Ollama. Every way it can fail becomes a plain sentence for the UI."""
    slow = HTTPException(504, "The owl took too long to answer. Try again, or pick a smaller model.")
    try:
        body = {"model": model, "messages": messages, "stream": False, **options}
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
        raise HTTPException(503, "The owl is asleep: Ollama isn't running on this laptop. Start Ollama, then try again.") from err
    except (OSError, ValueError, KeyError) as err:
        raise HTTPException(502, "Ollama couldn't answer. Try again, or pick another model.") from err


@router.post("/events/{event_id}/ask")
def ask(event_id: int, body: AskIn):
    model = body.model or config.OLLAMA_MODEL
    messages = [{"role": "system", "content": _facts(event_id)}, *(m.model_dump() for m in body.messages)]
    return {"reply": _chat(model, messages)}


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
    try:
        reply = _chat(
            model, [{"role": "system", "content": system}, {"role": "user", "content": user}],
            timeout=config.OLLAMA_PROMPT_TIMEOUT, format="json",
        )
    except HTTPException as err:
        log.warning("owl could not describe %r: %s", moment, err.detail)
        return plain
    return _captions(_json_reply(reply).get("prompts")) or plain


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
        raise HTTPException(400, "Add some photos first. The owl suggests moments from what's in them.")
    tags = _top_tags(db.load_embeddings(event_id)[[m["emb_index"] for m in media]])
    images = _sample([m["preview_path"] for m in media if m["preview_path"]]) if _can_see(model) else []

    system = (
        "You help sort the photos of one event in KuhaGo, an offline photo organizer. Work out what really happened"
        " and suggest the moments the photos should be sorted into. Trust what is in the photos over the event's"
        " name or kind: the photos may show something else entirely."
        f" Suggest at most {config.OWL_MAX_SUGGESTIONS} moments that are not on the list yet. A moment's name is 1 to 4"
        f" words. Give each moment 2 captions. {_VISIBLE}"
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
    raw = _json_reply(_chat(model, [{"role": "system", "content": system}, message], format="json")).get("moments")

    taken = {m.casefold() for m in [*have, config.UNSORTED]}
    out = []
    for m in raw if isinstance(raw, list) else []:
        name = m.get("moment") if isinstance(m, dict) else None
        name = name.strip()[: config.MOMENT_NAME_MAX].strip() if isinstance(name, str) else ""
        prompts = _captions(m.get("prompts")) if name else []
        if prompts and name.casefold() not in taken:
            taken.add(name.casefold())
            out.append({"moment": name, "prompts": prompts})
    if not out:
        raise HTTPException(502, "The owl didn't come up with any new moments. Try again, or pick another model.")
    return {"moments": out[: config.OWL_MAX_SUGGESTIONS], "saw_photos": bool(images)}
