import json
from contextlib import closing

from fastapi import APIRouter, HTTPException

from app import db
from ml.classifier import ShotItem
from ml.coverage import compute_coverage

router = APIRouter()


@router.get("/events/{event_id}/coverage")
def get_coverage(event_id: int):
    with closing(db.connect()) as con:
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
        shots = con.execute("SELECT id, moment, prompt FROM shot_items WHERE event_id = ? ORDER BY id", (event_id,)).fetchall()
        refs = con.execute(
            "SELECT r.shot_item_id, r.emb_index FROM refs r JOIN shot_items s ON s.id = r.shot_item_id"
            " WHERE s.event_id = ? AND r.emb_index IS NOT NULL",
            (event_id,),
        ).fetchall()
        media = con.execute(
            "SELECT id, emb_index, moment FROM media WHERE event_id = ? AND emb_index IS NOT NULL ORDER BY id", (event_id,)
        ).fetchall()
    all_emb = db.load_embeddings(event_id)  # example photos share the event's emb.npy with media
    items = []
    for s in shots:
        rows = [r["emb_index"] for r in refs if r["shot_item_id"] == s["id"]]
        items.append(ShotItem(s["moment"], json.loads(s["prompt"]), all_emb[rows] if rows else None))
    return compute_coverage(
        all_emb[[m["emb_index"] for m in media]], items, [m["id"] for m in media], [m["moment"] for m in media]
    )
