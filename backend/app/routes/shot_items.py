"""POST /shot_items/{id}/refs: example photos that teach a moment (AGENTS.md Agent 3)."""
import hashlib
import logging
from contextlib import closing
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps

from app import config, db
from app.routes.ingest import reclassify
from ml import clip_engine

log = logging.getLogger(__name__)
router = APIRouter()


def _save(data: bytes, out_dir: Path, shot_item_id: int) -> Path:
    """Uploads are kept as upright JPEGs (HEIC included) so the UI and the export can use them as they are."""
    out = out_dir / f"{shot_item_id}_{hashlib.sha1(data).hexdigest()[:16]}.jpg"
    if not out.exists():
        with Image.open(BytesIO(data)) as img:
            ref = ImageOps.exif_transpose(img).convert("RGB")
            ref.thumbnail((config.PREVIEW_MAX_PX, config.PREVIEW_MAX_PX))
            out_dir.mkdir(parents=True, exist_ok=True)
            ref.save(out, "JPEG", quality=config.PREVIEW_JPEG_QUALITY)
    return out


@router.post("/shot_items/{shot_item_id}/refs")
def add_refs(shot_item_id: int, files: list[UploadFile]):
    with closing(db.connect()) as con, con:
        item = con.execute("SELECT event_id FROM shot_items WHERE id = ?", (shot_item_id,)).fetchone()
        if item is None:
            raise HTTPException(404, "moment not found")
        event_id = item["event_id"]
        known = {r["image_path"] for r in con.execute("SELECT image_path FROM refs WHERE shot_item_id = ?", (shot_item_id,))}
        new = []
        for f in files:
            try:
                path = _save(f.file.read(), config.event_dir(event_id) / "refs", shot_item_id)
            except Exception as e:  # not a photo: skip it, keep the rest
                log.warning("skip example %s: %s", f.filename, e)
                continue
            if str(path) not in known and path not in new:
                new.append(path)
        ok, emb = clip_engine.embed_images(new)
        if ok:
            rows = db.append_embeddings(event_id, emb)
            con.executemany(
                "INSERT INTO refs(shot_item_id, image_path, emb_index) VALUES (?, ?, ?)",
                [(shot_item_id, str(p), row) for p, row in zip(ok, rows)],
            )
            reclassify(con, event_id)  # the examples change every photo's scores
        return {"added": len(ok)}


@router.get("/refs/{ref_id}/image")
def ref_image(ref_id: int):
    with closing(db.connect()) as con:
        row = con.execute("SELECT image_path FROM refs WHERE id = ?", (ref_id,)).fetchone()
    if not row or not Path(row["image_path"]).exists():
        raise HTTPException(404, "example photo not found")
    return FileResponse(row["image_path"], media_type="image/jpeg")
