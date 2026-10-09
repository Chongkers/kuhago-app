"""Editing an event's checklist (add, change, remove a moment) and the example photos that teach a moment
(AGENTS.md Agent 3). Every change re-labels the event."""
import hashlib
import json
import logging
from contextlib import closing
from io import BytesIO
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageOps
from pydantic import BaseModel, StringConstraints

from app import config, db
from app.routes import owl
from app.routes.events import shot_items_out
from app.routes.ingest import reclassify
from ml import clip_engine

log = logging.getLogger(__name__)
router = APIRouter()

Moment = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=config.MOMENT_NAME_MAX)]
Prompt = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class ShotItemPatch(BaseModel):
    # `= None`: may be omitted, but an explicit null is rejected
    moment: Moment = None
    prompts: list[Prompt] = None  # what is visible in the photo, for CLIP
    required: bool = None


class ShotItemIn(ShotItemPatch):
    moment: Moment
    prompts: list[Prompt] = []
    required: bool = True
    model: str | None = None  # Ollama model that may write the prompts when none are given


def _check_name(con, event_id: int, moment: str, own_id: int | None = None) -> None:
    if moment.casefold() == config.UNSORTED.casefold():
        raise HTTPException(409, f"{config.UNSORTED} is where KuhaGo puts what it can't place. Pick another name.")
    taken = con.execute(
        "SELECT id FROM shot_items WHERE event_id = ? AND lower(moment) = lower(?)", (event_id, moment)
    ).fetchone()
    if taken and taken["id"] != own_id:
        raise HTTPException(409, f"There's already a moment called {moment}.")


def _item_or_404(con, shot_item_id: int):
    item = con.execute("SELECT * FROM shot_items WHERE id = ?", (shot_item_id,)).fetchone()
    if item is None:
        raise HTTPException(404, "moment not found")
    return item


def _out(con, event_id: int, shot_item_id: int) -> dict:
    return next(i for i in shot_items_out(con, event_id) if i["id"] == shot_item_id)


@router.post("/events/{event_id}/shot_items")
def add_shot_item(event_id: int, body: ShotItemIn):
    with closing(db.connect()) as con:
        event = con.execute("SELECT event_type FROM events WHERE id = ?", (event_id,)).fetchone()
        if event is None:
            raise HTTPException(404, "event not found")
        _check_name(con, event_id, body.moment)
    # Ollama may take a while; no database connection is held open for it
    prompts = body.prompts or owl.visible_prompts(body.moment, event["event_type"], body.model)
    with closing(db.connect()) as con, con:
        _check_name(con, event_id, body.moment)
        new_id = con.execute(
            "INSERT INTO shot_items(event_id, moment, prompt, required) VALUES (?, ?, ?, ?)",
            (event_id, body.moment, json.dumps(prompts), body.required),
        ).lastrowid
        reclassify(con, event_id)
        return _out(con, event_id, new_id)


@router.patch("/shot_items/{shot_item_id}")
def update_shot_item(shot_item_id: int, body: ShotItemPatch):
    fields = body.model_dump(exclude_unset=True)
    with closing(db.connect()) as con, con:
        item = _item_or_404(con, shot_item_id)
        event_id = item["event_id"]
        if "moment" in fields:
            _check_name(con, event_id, fields["moment"], shot_item_id)
            # what the user put in this moment by hand follows it to its new name
            con.execute(
                "UPDATE media SET moment = ? WHERE event_id = ? AND moment = ? AND moment_locked = 1",
                (fields["moment"], event_id, item["moment"]),
            )
        if "prompts" in fields:
            if not fields["prompts"]:
                raise HTTPException(422, "A moment needs at least one description of what's in the photo.")
            fields["prompt"] = json.dumps(fields.pop("prompts"))
        if fields:  # keys are model fields only, never user-chosen column names
            con.execute(
                f"UPDATE shot_items SET {', '.join(f'{k} = ?' for k in fields)} WHERE id = ?", (*fields.values(), shot_item_id)
            )
        if fields.keys() & {"moment", "prompt"}:  # must-have alone changes no photo's label
            reclassify(con, event_id)
        return _out(con, event_id, shot_item_id)


@router.delete("/shot_items/{shot_item_id}")
def delete_shot_item(shot_item_id: int):
    """Takes the moment and its example photos off the checklist; its media goes back through the classifier."""
    with closing(db.connect()) as con, con:
        event_id = _item_or_404(con, shot_item_id)["event_id"]
        con.execute("DELETE FROM shot_items WHERE id = ?", (shot_item_id,))
        reclassify(con, event_id)
        return shot_items_out(con, event_id)


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


@router.delete("/refs/{ref_id}")
def delete_ref(ref_id: int):
    """Takes one example photo off its moment and re-labels the event. Its row in emb.npy stays, unused."""
    with closing(db.connect()) as con, con:
        row = con.execute(
            "SELECT r.image_path, s.event_id FROM refs r JOIN shot_items s ON s.id = r.shot_item_id WHERE r.id = ?", (ref_id,)
        ).fetchone()
        if row is None:
            raise HTTPException(404, "This example photo was already removed.")
        con.execute("DELETE FROM refs WHERE id = ?", (ref_id,))
        reclassify(con, row["event_id"])
    stored = Path(row["image_path"])
    if stored.is_relative_to(config.event_dir(row["event_id"])):  # only ever KuhaGo's own copy (see _save)
        stored.unlink(missing_ok=True)
    return {"removed": ref_id}


@router.get("/refs/{ref_id}/image")
def ref_image(ref_id: int):
    with closing(db.connect()) as con:
        row = con.execute("SELECT image_path FROM refs WHERE id = ?", (ref_id,)).fetchone()
    if not row or not Path(row["image_path"]).exists():
        raise HTTPException(404, "example photo not found")
    return FileResponse(row["image_path"], media_type="image/jpeg")
