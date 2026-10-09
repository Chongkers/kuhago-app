from contextlib import closing

import numpy as np
from fastapi import APIRouter

from app import config, db
from app.routes.media import COLS, media_out
from ml.search import top_k

router = APIRouter()


@router.get("/search")
def get_search(q: str, event_id: int | None = None):
    """Event-scoped when event_id is given, otherwise across all events."""
    if not q.strip():
        return []
    sql, args = f"SELECT {COLS}, emb_index FROM media WHERE emb_index IS NOT NULL", []
    if event_id is not None:
        sql, args = sql + " AND event_id = ?", [event_id]
    with closing(db.connect()) as con:
        rows = con.execute(sql, args).fetchall()
    embs = {ev: db.load_embeddings(ev) for ev in {r["event_id"] for r in rows}}
    emb = np.stack([embs[r["event_id"]][r["emb_index"]] for r in rows]) if rows else np.zeros((0, config.EMB_DIM), np.float32)
    return [{**media_out(rows[i]), "score": score} for i, score in top_k(emb, q)]
