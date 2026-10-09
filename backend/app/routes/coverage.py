from contextlib import closing

from fastapi import APIRouter, HTTPException

from app import db
from ml.coverage import compute_coverage

router = APIRouter()


@router.get("/events/{event_id}/coverage")
def get_coverage(event_id: int):
    with closing(db.connect()) as con:
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
        all_emb = db.load_embeddings(event_id)
        items = db.load_shot_items(con, event_id, all_emb)
        media = con.execute(
            "SELECT id, emb_index, moment FROM media WHERE event_id = ? AND emb_index IS NOT NULL ORDER BY id", (event_id,)
        ).fetchall()
    return compute_coverage(
        all_emb[[m["emb_index"] for m in media]], items, [m["id"] for m in media], [m["moment"] for m in media]
    )
