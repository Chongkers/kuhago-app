import json
from contextlib import closing
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db

router = APIRouter()

# Loaded once; keys are the only accepted event_type values, so a request can never pick an arbitrary path.
TEMPLATES = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in config.TEMPLATES_DIR.glob("*.json")}


Mode = Literal["personal", "pro"]
Status = Literal["inquiry", "booked", "shot", "editing", "delivered"]


class EventPatch(BaseModel):
    # `str = None`: may be omitted, but an explicit null is rejected (non-null in the API contract)
    mode: Mode = None
    name: str = None
    event_type: str = None
    date: str | None = None
    venue: str | None = None
    client: str | None = None
    fee: float | None = None
    paid: bool | None = None
    status: Status | None = None


class EventIn(EventPatch):
    mode: Mode
    name: str
    event_type: str


class TemplateIn(BaseModel):
    event_type: str


def _event_out(row) -> dict:
    return {**row, "paid": None if row["paid"] is None else bool(row["paid"])}


def _event_or_404(con, event_id: int) -> dict:
    row = con.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "event not found")
    return _event_out(row)


def _shot_items(con, event_id: int) -> list[dict]:
    rows = con.execute("SELECT * FROM shot_items WHERE event_id = ? ORDER BY id", (event_id,)).fetchall()
    return [{**r, "prompt": json.loads(r["prompt"]), "required": bool(r["required"])} for r in rows]


@router.get("/events")
def list_events():
    with closing(db.connect()) as con:
        return [_event_out(r) for r in con.execute("SELECT * FROM events ORDER BY id")]


@router.post("/events")
def create_event(body: EventIn):
    fields = body.model_dump()
    with closing(db.connect()) as con, con:
        event_id = con.execute(
            f"INSERT INTO events({', '.join(fields)}) VALUES ({', '.join('?' * len(fields))})", tuple(fields.values())
        ).lastrowid
        return _event_or_404(con, event_id)


@router.patch("/events/{event_id}")
def update_event(event_id: int, body: EventPatch):
    fields = body.model_dump(exclude_unset=True)  # keys are model fields only, never user-chosen column names
    with closing(db.connect()) as con, con:
        if fields:
            con.execute(
                f"UPDATE events SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*fields.values(), event_id)
            )
        return _event_or_404(con, event_id)


@router.get("/events/{event_id}/shot_items")
def list_shot_items(event_id: int):
    with closing(db.connect()) as con:
        _event_or_404(con, event_id)
        return _shot_items(con, event_id)


@router.post("/events/{event_id}/template")
def apply_template(event_id: int, body: TemplateIn):
    """Replace the event's shot items with the template's moments."""
    template = TEMPLATES.get(body.event_type)
    if template is None:
        raise HTTPException(404, f"unknown template {body.event_type!r}")
    with closing(db.connect()) as con, con:
        if not con.execute("UPDATE events SET event_type = ? WHERE id = ?", (body.event_type, event_id)).rowcount:
            raise HTTPException(404, "event not found")
        con.execute("DELETE FROM shot_items WHERE event_id = ?", (event_id,))
        con.executemany(
            "INSERT INTO shot_items(event_id, moment, prompt, required) VALUES (?, ?, ?, ?)",
            [(event_id, m["moment"], json.dumps(m["prompts"]), m["required"]) for m in template["moments"]],
        )
        return _shot_items(con, event_id)
