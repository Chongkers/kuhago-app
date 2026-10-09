"""Pro: POST /events/{id}/finals scans a folder of edited exports as a background job;
GET /events/{id}/finals returns matched pairs, unmatched finals and selects not yet edited."""
import logging
import shutil
from contextlib import closing
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db, jobs
from media.previews import make_preview
from media.xmp import ExifToolMissing, read_ratings
from ml import clip_engine, highlights
from ml.matcher import match_finals

log = logging.getLogger(__name__)
router = APIRouter()

SELECT_SQL = "(is_select = 1 OR COALESCE(rating, 0) >= ?)"


class FinalsIn(BaseModel):
    folder: str


def _phash(preview: Path) -> int | None:
    try:
        return highlights.phash(preview)
    except Exception as e:
        log.warning("no pHash for %s: %s", preview, e)
        return None


@router.post("/events/{event_id}/finals")
def start_finals(event_id: int, body: FinalsIn):
    with closing(db.connect()) as con:
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
    typed = body.folder.strip()
    if not typed or not Path(typed).expanduser().is_dir():
        raise HTTPException(400, f"Can't find this folder: {typed}" if typed else "Type a folder path first.")
    return {"job_id": jobs.start(run_finals, event_id, Path(typed).expanduser().resolve())}


def run_finals(report, event_id: int, folder: Path) -> None:
    with closing(db.connect()) as con, con:
        photos = con.execute("SELECT id, path FROM media WHERE event_id = ? AND kind = 'photo'", (event_id,)).fetchall()
        report("ratings", 0, len(photos))
        try:  # star ratings live in the editor's sidecars; without ExifTool the stored ones are kept
            ratings = read_ratings([Path(p["path"]) for p in photos])
            con.executemany(
                "UPDATE media SET rating = ? WHERE id = ?", [(ratings.get(Path(p["path"])), p["id"]) for p in photos]
            )
        except (ExifToolMissing, OSError, ValueError) as e:
            log.warning("ratings not read: %s", e)
        report("ratings", len(photos), len(photos))

    files = sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in config.IMAGE_EXTS)
    out_dir = config.event_dir(event_id) / "finals"
    shutil.rmtree(out_dir, ignore_errors=True)  # finals get re-exported under the same name: never reuse a preview
    src_of = {}  # preview -> final
    for i, src in enumerate(files, 1):
        try:
            src_of[make_preview(src, out_dir)[0]] = src
        except Exception as e:
            log.warning("skip %s: %s", src, e)
        report("previews", i, len(files))
    got, final_emb = clip_engine.embed_images(list(src_of))
    report("embedding", len(got), len(got))

    with closing(db.connect()) as con, con:
        selects = con.execute(
            f"SELECT id, preview_path, emb_index FROM media WHERE event_id = ? AND kind = 'photo'"
            f" AND emb_index IS NOT NULL AND {SELECT_SQL} ORDER BY id",
            (event_id, config.SELECT_MIN_RATING),
        ).fetchall()
        select_emb = db.load_embeddings(event_id)[[s["emb_index"] for s in selects]]
        matches = match_finals(
            final_emb, [_phash(p) for p in got], select_emb, [_phash(Path(s["preview_path"])) for s in selects]
        )
        con.execute("DELETE FROM finals WHERE event_id = ?", (event_id,))  # a re-scan replaces the last one
        con.executemany(
            "INSERT INTO finals(event_id, path, matched_media_id, match_score) VALUES (?, ?, ?, ?)",
            [
                (event_id, str(src_of[p]), None if j is None else selects[j]["id"], score)
                for p, (j, score) in zip(got, matches)
            ],
        )
    report("matching", len(got), len(got))


@router.get("/events/{event_id}/finals")
def get_finals(event_id: int):
    with closing(db.connect()) as con:
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
        finals = con.execute("SELECT * FROM finals WHERE event_id = ? ORDER BY id", (event_id,)).fetchall()
        selects = con.execute(
            f"SELECT id FROM media WHERE event_id = ? AND kind = 'photo' AND {SELECT_SQL} ORDER BY id",
            (event_id, config.SELECT_MIN_RATING),
        ).fetchall()
    matched = [f for f in finals if f["matched_media_id"] is not None]
    edited = {f["matched_media_id"] for f in matched}
    return {
        "matched": [{"final_path": f["path"], "media_id": f["matched_media_id"], "score": f["match_score"]} for f in matched],
        "unmatched_finals": [f["path"] for f in finals if f["matched_media_id"] is None],
        "unedited_selects": [s["id"] for s in selects if s["id"] not in edited],
    }
