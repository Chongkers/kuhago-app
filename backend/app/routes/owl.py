"""Ask the owl: a chat about one event, answered by Ollama running on this machine."""
import json
import urllib.error
import urllib.request
from contextlib import closing
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import config, db
from app.routes.coverage import get_coverage

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
    missed = [c["moment"] for c in coverage if not c["covered"]]
    details = ", ".join(f"{k}: {ev[k]}" for k in ("event_type", "date", "venue") if ev[k])
    return "\n".join([
        "You are the owl in KuhaGo, a photo organizer that runs offline on the user's laptop.",
        "Answer in short, plain sentences. Only use the facts below; if they don't answer the question, say so.",
        "You can't move, rename, delete or copy files.",
        f"Event: {ev['name']}" + (f" ({details})" if details else ""),
        "Photos and videos per moment: " + ", ".join(counts),
        "Missed moments: " + (", ".join(missed) or "none"),
    ])


@router.post("/events/{event_id}/ask")
def ask(event_id: int, body: AskIn):
    model = body.model or config.OLLAMA_MODEL
    messages = [{"role": "system", "content": _facts(event_id)}, *(m.model_dump() for m in body.messages)]
    slow = HTTPException(504, "The owl took too long to answer. Try again, or pick a smaller model.")
    try:
        return {"reply": _ollama("/api/chat", {"model": model, "messages": messages, "stream": False})["message"]["content"]}
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
