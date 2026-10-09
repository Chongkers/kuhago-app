"""Multi-folder photo and video ingest as a background job (AGENTS.md Agent 1). Originals are only read."""
import hashlib
import logging
import shutil
from datetime import datetime
from contextlib import closing
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import config, db, jobs
from media.previews import make_preview
from media.video import extract_audio, extract_frames
from media.video import taken_at as video_taken_at
from ml import clip_engine, highlights, vad
from ml.classifier import classify_clip, classify_moments

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
        raise HTTPException(400, f"Can't find this folder: {', '.join(bad)}" if bad else "Type a folder path first.")
    if event_id in _running:
        raise HTTPException(409, "this event is already being organized")
    _running.add(event_id)
    return {"job_id": jobs.start(run_ingest, event_id, folders)}


def run_ingest(report, event_id: int, folders: list[Path]) -> None:
    try:
        _ingest(report, event_id, folders)
    finally:
        _running.discard(event_id)


def _clip(src: Path, event_id: int, out_dir: Path, items, pop: np.ndarray) -> tuple:
    """One video -> (preview, taken_at, embedding, speech ratio, roll, moment, confidence). The preview and the
    embedding are of the frame that best shows the clip's moment, so reclassify, coverage and search agree with it."""
    key = hashlib.sha1(str(src).encode()).hexdigest()[:20]
    work = config.event_dir(event_id) / "frames" / key
    try:
        got, emb = clip_engine.embed_images(extract_frames(src, work))
        if not len(emb):
            raise ValueError("no readable frames")
        moment, conf, best = classify_clip(emb, items, pop)
        preview = out_dir / f"{key}.jpg"
        out_dir.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(got[best], preview)
        wav = extract_audio(src, work / "audio.wav")
        ratio = vad.speech_ratio(wav) if wav else 0.0  # no audio track: scenery
        mean = emb.mean(0)  # talking is about the whole clip, not its best frame
        roll = vad.pick_roll(ratio, float(vad.talk_scores((mean / np.linalg.norm(mean))[None])[0]))
        return preview, video_taken_at(src), emb[best], ratio, roll, moment, conf
    finally:
        shutil.rmtree(work, ignore_errors=True)  # frames and audio are scratch; only the preview is kept


def _ingest(report, event_id: int, folders: list[Path]) -> None:
    with closing(db.connect()) as con:
        known = {r["path"] for r in con.execute("SELECT path FROM media WHERE event_id = ?", (event_id,))}
    found = {p for folder in folders for p in folder.rglob("*") if p.is_file() and str(p) not in known}
    files = sorted(p for p in found if p.suffix.lower() in config.IMAGE_EXTS | config.RAW_EXTS)
    videos = sorted(p for p in found if p.suffix.lower() in config.VIDEO_EXTS)

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

    photo_emb = np.concatenate([np.zeros((0, config.EMB_DIM), np.float32), *embs])
    with closing(db.connect()) as con:
        all_emb = db.load_embeddings(event_id)
        items = db.load_shot_items(con, event_id, all_emb)
        earlier = all_emb[[r["emb_index"] for r in con.execute(
            "SELECT emb_index FROM media WHERE event_id = ? AND emb_index IS NOT NULL", (event_id,)
        )]]
    # example-photo scores are scaled against the whole event, not just this folder
    pop = np.concatenate([earlier, photo_emb])

    clips = {}  # src -> (preview path, taken_at, embedding, speech ratio, roll, moment, confidence)
    for i, src in enumerate(videos, 1):
        try:
            clips[src] = _clip(src, event_id, out_dir, items, pop)
        except Exception as e:  # includes FFmpeg missing from PATH
            log.warning("skip %s: %s", src, e)
        report("videos", i, len(videos))
    if not ok and not clips:
        return

    clip_emb = np.stack([c[2] for c in clips.values()]) if clips else np.zeros((0, config.EMB_DIM), np.float32)
    rows = db.append_embeddings(event_id, np.concatenate([photo_emb, clip_emb]))
    total = len(ok) + len(clips)
    report("classifying", 0, total)
    labels = classify_moments(photo_emb, items, np.concatenate([pop, clip_emb]))
    with closing(db.connect()) as con, con:
        con.executemany(
            "INSERT OR IGNORE INTO media(event_id, path, kind, preview_path, emb_index, taken_at, moment, confidence)"
            " VALUES (?, ?, 'photo', ?, ?, ?, ?, ?)",
            [
                (event_id, str(src), str(previews[src][0]), row, previews[src][1], moment, conf)
                for src, row, (moment, conf) in zip(ok, rows, labels)
            ],
        )
        con.executemany(
            "INSERT OR IGNORE INTO media(event_id, path, kind, preview_path, emb_index, taken_at, moment, confidence,"
            " roll, speech_ratio) VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?)",
            [
                (event_id, str(src), str(c[0]), row, c[1], c[5], c[6], c[4], c[3])
                for (src, c), row in zip(clips.items(), rows[len(ok) :])
            ],
        )
    report("classifying", total, total)
    with closing(db.connect()) as con, con:
        _curate(report, con, event_id)


def reclassify(con, event_id: int) -> None:
    """Re-label every media item after the checklist or its example photos changed, then redo highlights."""
    rows = con.execute(
        "SELECT id, emb_index FROM media WHERE event_id = ? AND emb_index IS NOT NULL ORDER BY id", (event_id,)
    ).fetchall()
    if not rows:
        return
    all_emb = db.load_embeddings(event_id)
    labels = classify_moments(all_emb[[r["emb_index"] for r in rows]], db.load_shot_items(con, event_id, all_emb))
    con.executemany(
        "UPDATE media SET moment = ?, confidence = ? WHERE id = ?",
        [(moment, conf, r["id"]) for r, (moment, conf) in zip(rows, labels)],
    )
    _curate(lambda *_: None, con, event_id)


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
