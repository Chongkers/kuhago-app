"""SQLite schema (AGENTS.md §5) + per-event emb.npy helpers. emb_index = row in that event's emb.npy."""
import json
import sqlite3
import threading

import numpy as np

from app import config
from ml.classifier import ShotItem

SCHEMA = """
CREATE TABLE IF NOT EXISTS events(
    id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL CHECK (mode IN ('personal', 'pro')),
    name TEXT NOT NULL,
    event_type TEXT, date TEXT, venue TEXT,
    client TEXT, fee REAL, paid INTEGER,
    status TEXT CHECK (status IN ('inquiry', 'booked', 'shot', 'editing', 'delivered'))
);
CREATE TABLE IF NOT EXISTS shot_items(
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    moment TEXT NOT NULL,
    prompt TEXT NOT NULL,  -- JSON list of CLIP prompts
    required INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS refs(
    id INTEGER PRIMARY KEY,
    shot_item_id INTEGER NOT NULL REFERENCES shot_items(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    emb_index INTEGER
);
CREATE TABLE IF NOT EXISTS media(
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('photo', 'video')),
    preview_path TEXT, emb_index INTEGER, taken_at TEXT,
    moment TEXT, confidence REAL,
    roll TEXT CHECK (roll IN ('A', 'B')),
    speech_ratio REAL, sharpness REAL,
    dup_group INTEGER, is_highlight INTEGER NOT NULL DEFAULT 0,
    rating INTEGER, is_select INTEGER NOT NULL DEFAULT 0,
    UNIQUE(event_id, path)
);
CREATE TABLE IF NOT EXISTS finals(
    id INTEGER PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    matched_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
    match_score REAL
);
"""

_emb_lock = threading.Lock()  # ponytail: one global lock for all events, per-event locks if ingest contends


def connect() -> sqlite3.Connection:
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(config.DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(SCHEMA)
    return con


def _emb_path(event_id: int):
    return config.event_dir(event_id) / "emb.npy"


def load_embeddings(event_id: int) -> np.ndarray:
    p = _emb_path(event_id)
    if not p.exists():
        return np.zeros((0, config.EMB_DIM), np.float32)
    return np.load(p)


def append_embeddings(event_id: int, emb: np.ndarray) -> list[int]:
    """Append rows to the event's emb.npy; returns their emb_index values."""
    with _emb_lock:
        old = load_embeddings(event_id)
        p = _emb_path(event_id)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        with open(tmp, "wb") as f:
            np.save(f, np.vstack([old, emb.astype(np.float32)]))
        tmp.replace(p)  # atomic: a crash mid-write never corrupts existing embeddings
        return list(range(len(old), len(old) + len(emb)))


def load_shot_items(con: sqlite3.Connection, event_id: int, all_emb: np.ndarray) -> list[ShotItem]:
    """The event's shot items with their example-photo rows (which share the event's emb.npy with media)."""
    shots = con.execute("SELECT id, moment, prompt, required FROM shot_items WHERE event_id = ? ORDER BY id", (event_id,)).fetchall()
    refs = con.execute(
        "SELECT r.shot_item_id, r.emb_index FROM refs r JOIN shot_items s ON s.id = r.shot_item_id"
        " WHERE s.event_id = ? AND r.emb_index IS NOT NULL",
        (event_id,),
    ).fetchall()
    items = []
    for s in shots:
        rows = [r["emb_index"] for r in refs if r["shot_item_id"] == s["id"]]
        items.append(ShotItem(s["moment"], json.loads(s["prompt"]), all_emb[rows] if rows else None, bool(s["required"])))
    return items
