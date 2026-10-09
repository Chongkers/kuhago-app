import json
from contextlib import closing

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db

router = APIRouter()

# Loaded once; keys are the only accepted event_type values, so a request can never pick an arbitrary path.
TEMPLATES = {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in config.TEMPLATES_DIR.glob("*.json")}


class TemplateIn(BaseModel):
    event_type: str


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
        return [
            {
                "id": con.execute(
                    "INSERT INTO shot_items(event_id, moment, prompt, required) VALUES (?, ?, ?, ?)",
                    (event_id, m["moment"], json.dumps(m["prompts"]), m["required"]),
                ).lastrowid,
                "event_id": event_id,
                "moment": m["moment"],
                "prompt": m["prompts"],
                "required": m["required"],
            }
            for m in template["moments"]
        ]
