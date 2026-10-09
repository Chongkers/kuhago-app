"""Multi-folder photo ingest as a background job (AGENTS.md Agent 1). Originals are only read."""
import logging
from datetime import datetime
from contextlib import closing
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db, jobs
from media.previews import make_preview
from ml import clip_engine, highlights
from ml.classifier import classify_moments

log = logging.getLogger(__name__)
router = APIRouter()
_running: set[int] = set()  # event ids with an ingest in flight; two at once would embed everything twice


class IngestIn(BaseModel):
    folders: list[str]


@router.post("/events/{event_id}/ingest")
def start_ingest(event_id: int, body: IngestIn):
    with closing(db.connect()) as con:
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
    folders = [Path(f).expanduser().resolve() for f in body.folders]
    bad = [str(f) for f in folders if not f.is_dir()]
    if not folders or bad:
        raise HTTPException(400, f"not a folder: {bad}")
    if event_id in _running:
        raise HTTPException(409, "this event is already being organized")
    _running.add(event_id)
    return {"job_id": jobs.start(run_ingest, event_id, folders)}


def run_ingest(report, event_id: int, folders: list[Path]) -> None:
    try:
        _ingest(report, event_id, folders)
    finally:
        _running.discard(event_id)


def _ingest(report, event_id: int, folders: list[Path]) -> None:
    with closing(db.connect()) as con:
        known = {r["path"] for r in con.execute("SELECT path FROM media WHERE event_id = ?", (event_id,))}
    found = [p for folder in folders for p in folder.rglob("*") if p.is_file()]
    files = sorted({p for p in found if p.suffix.lower() in config.IMAGE_EXTS | config.RAW_EXTS and str(p) not in known})
    # ponytail: photos only; videos (ffmpeg frames + VAD) land with the talking/scenery task
    if videos := sum(p.suffix.lower() in config.VIDEO_EXTS for p in found):
        log.info("skipping %d videos: not supported yet", videos)

    out_dir = config.event_dir(event_id) / "previews"
    previews = {}  # src -> (preview path, taken_at)
    for i, src in enumerate(files, 1):
        try:
            previews[src] = make_preview(src, out_dir)
        except Exception as e:
            log.warning("skip %s: %s", src, e)
        report("previews", i, len(files))

    srcs = list(previews)
    src_of = {previews[s][0]: s for s in srcs}
    ok, embs = [], []
    for i in range(0, len(srcs), config.BATCH_SIZE):
        got, emb = clip_engine.embed_images([previews[s][0] for s in srcs[i : i + config.BATCH_SIZE]])
        ok += [src_of[p] for p in got]
        embs.append(emb)
        report("embedding", min(i + config.BATCH_SIZE, len(srcs)), len(srcs))
    if not ok:
        return

    emb = np.concatenate(embs)
    rows = db.append_embeddings(event_id, emb)
    report("classifying", 0, len(ok))
    with closing(db.connect()) as con, con:
        labels = classify_moments(emb, db.load_shot_items(con, event_id, db.load_embeddings(event_id)))
        con.executemany(
            "INSERT OR IGNORE INTO media(event_id, path, kind, preview_path, emb_index, taken_at, moment, confidence)"
            " VALUES (?, ?, 'photo', ?, ?, ?, ?, ?)",
            [
                (event_id, str(src), str(previews[src][0]), row, previews[src][1], moment, conf)
                for src, row, (moment, conf) in zip(ok, rows, labels)
            ],
        )
    report("classifying", len(ok), len(ok))
    with closing(db.connect()) as con, con:
        _curate(report, con, event_id)


def _curate(report, con, event_id: int) -> None:
    """Sharpness for new photos, then duplicate groups + highlights over the whole event (a new folder can
    hold bursts of moments already ingested)."""
    rows = con.execute(
        "SELECT id, preview_path, emb_index, taken_at, moment, sharpness FROM media"
        " WHERE event_id = ? AND kind = 'photo' ORDER BY id",
        (event_id,),
    ).fetchall()
    sharp, hashes = [], []
    for i, r in enumerate(rows, 1):
        try:
            s = r["sharpness"] if r["sharpness"] is not None else highlights.sharpness(Path(r["preview_path"]))
            h = highlights.phash(Path(r["preview_path"]))  # ponytail: rehashed every ingest, store it if events get huge
        except Exception as e:
            log.warning("skip curation of %s: %s", r["preview_path"], e)
            s, h = 0.0, None  # unreadable preview: never a highlight, only CLIP can group it
        sharp.append(s)
        hashes.append(h)
        report("highlights", i, len(rows))
    moments = [r["moment"] for r in rows]
    taken = [datetime.fromisoformat(r["taken_at"]).timestamp() if r["taken_at"] else 0.0 for r in rows]
    groups = highlights.group_duplicates(moments, taken, hashes, db.load_embeddings(event_id)[[r["emb_index"] for r in rows]])
    picks = highlights.pick_highlights(moments, highlights.percentile_rank(sharp), groups)
    con.executemany(
        "UPDATE media SET sharpness = ?, dup_group = ?, is_highlight = ? WHERE id = ?",
        [(s, None if g is None else rows[g]["id"], int(p), r["id"]) for r, s, g, p in zip(rows, sharp, groups, picks)],
    )
