from contextlib import closing
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from PIL import Image

from app import config, db
from app.routes.ingest import reclassify

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
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
        return [media_out(r) for r in con.execute(sql + " ORDER BY taken_at, id", args)]


@router.get("/events/{event_id}/highlights")
def list_highlights(event_id: int):
    return list_media(event_id, highlights=True)


@router.get("/media/{media_id}/preview")
def preview(media_id: int):
    with closing(db.connect()) as con:
        row = con.execute("SELECT preview_path FROM media WHERE id = ?", (media_id,)).fetchone()
    if not row or not row["preview_path"] or not Path(row["preview_path"]).exists():
        raise HTTPException(404, "preview not found")
    return FileResponse(row["preview_path"], media_type="image/jpeg")


@router.delete("/media/{media_id}")
def remove_media(media_id: int):
    """Take one photo or video out of its event: the row, its preview and its thumb go. The original file is
    never touched. The rest is re-labelled, since the example-photo scale and the highlights depend on what is in
    the event."""
    with closing(db.connect()) as con, con:
        row = con.execute("SELECT event_id, preview_path FROM media WHERE id = ?", (media_id,)).fetchone()
        if not row:
            raise HTTPException(404, "This photo is no longer in the event.")
        con.execute("DELETE FROM media WHERE id = ?", (media_id,))
        reclassify(con, row["event_id"])
    if row["preview_path"]:
        src = Path(row["preview_path"])
        for cached in (src, src.parent.parent / "thumbs" / src.name):
            cached.unlink(missing_ok=True)
    return {"removed": media_id}


@router.get("/media/{media_id}/thumb")
def thumb(media_id: int):
    """A small copy of the preview for grids, made on first request and kept. The UI adds a version to the URL
    (SQLite reuses media ids after an event is deleted), so the browser may cache it for good."""
    with closing(db.connect()) as con:
        row = con.execute("SELECT preview_path FROM media WHERE id = ?", (media_id,)).fetchone()
    src = Path(row["preview_path"]) if row and row["preview_path"] else None
    if src is None or not src.exists():
        raise HTTPException(404, "preview not found")
    out = src.parent.parent / "thumbs" / src.name
    if not out.exists() or out.stat().st_mtime < src.stat().st_mtime:
        out.parent.mkdir(parents=True, exist_ok=True)
        tmp = out.with_suffix(f".{media_id}.tmp")  # two requests never share a half-written file
        with Image.open(src) as img:
            img.draft("RGB", (config.THUMB_MAX_PX, config.THUMB_MAX_PX))  # JPEG: decode small, much faster
            small = img.convert("RGB")
            small.thumbnail((config.THUMB_MAX_PX, config.THUMB_MAX_PX))
            small.save(tmp, "JPEG", quality=config.THUMB_JPEG_QUALITY)
        tmp.replace(out)
    return FileResponse(
        out, media_type="image/jpeg", headers={"Cache-Control": f"private, max-age={config.THUMB_MAX_AGE}, immutable"}
    )
