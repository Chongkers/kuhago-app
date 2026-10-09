"""POST /events/{id}/xmp (Pro): write moment and roll keywords into XMP sidecars."""
from contextlib import closing
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db
from media.xmp import ExifToolMissing, write_keywords

router = APIRouter()
ROLL_KEYWORD = {"A": "A-roll", "B": "B-roll"}


class XmpIn(BaseModel):
    mode: Literal["lightroom", "darktable"]


def _clean(part: str) -> str:
    return part.replace("|", "-").strip()  # "|" separates hierarchy levels


@router.post("/events/{event_id}/xmp")
def write_xmp(event_id: int, body: XmpIn):
    with closing(db.connect()) as con:
        ev = con.execute("SELECT event_type, name FROM events WHERE id = ?", (event_id,)).fetchone()
        if ev is None:
            raise HTTPException(404, "event not found")
        media = con.execute(
            "SELECT path, moment, roll FROM media WHERE event_id = ? ORDER BY id", (event_id,)
        ).fetchall()
    label = _clean((ev["event_type"] or ev["name"]).replace("_", " ").title())
    items = []
    for m in media:
        flat, hier = [], []
        if m["moment"] and m["moment"] != config.UNSORTED:
            flat.append(m["moment"])
            hier.append(f"{config.XMP_ROOT_KEYWORD}|{label}|{_clean(m['moment'])}")
        if m["roll"] in ROLL_KEYWORD:
            flat.append(ROLL_KEYWORD[m["roll"]])
        items.append((Path(m["path"]), flat, hier))
    try:
        return {"written": write_keywords(items, body.mode)}
    except ExifToolMissing as e:
        raise HTTPException(503, str(e)) from e
    except RuntimeError as e:
        raise HTTPException(500, str(e)) from e
