from contextlib import closing
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app import db

router = APIRouter()

FIELDS = ("id", "event_id", "path", "kind", "taken_at", "moment", "confidence", "roll", "speech_ratio",
          "sharpness", "dup_group", "is_highlight", "rating", "is_select")
COLS = ", ".join(FIELDS)


def media_out(row) -> dict:
    d = {k: row[k] for k in FIELDS}
    d["is_highlight"], d["is_select"] = bool(d["is_highlight"]), bool(d["is_select"])
    return d


@router.get("/events/{event_id}/media")
def list_media(event_id: int, moment: str | None = None, roll: str | None = None, highlights: bool = False):
    sql, args = f"SELECT {COLS} FROM media WHERE event_id = ?", [event_id]
    if moment:
        sql, args = sql + " AND moment = ?", args + [moment]
    if roll:
        sql, args = sql + " AND roll = ?", args + [roll]
    if highlights:
        sql += " AND is_highlight = 1"
    with closing(db.connect()) as con:
        return [media_out(r) for r in con.execute(sql + " ORDER BY taken_at, id", args)]


@router.get("/media/{media_id}/preview")
def preview(media_id: int):
    with closing(db.connect()) as con:
        row = con.execute("SELECT preview_path FROM media WHERE id = ?", (media_id,)).fetchone()
    if not row or not row["preview_path"] or not Path(row["preview_path"]).exists():
        raise HTTPException(404, "preview not found")
    return FileResponse(row["preview_path"], media_type="image/jpeg")
