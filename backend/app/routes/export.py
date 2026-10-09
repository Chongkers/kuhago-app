"""POST /events/{id}/export: dry run returns the plan; otherwise copies as a background job."""
from contextlib import closing
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app import db, jobs
from media.export import execute_export, plan_export

router = APIRouter()


class ExportIn(BaseModel):
    dest: str = ""
    dry_run: bool = True


@router.post("/events/{event_id}/export")
def export(event_id: int, body: ExportIn):
    with closing(db.connect()) as con:
        if not con.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone():
            raise HTTPException(404, "event not found")
        plan = plan_export(con, event_id)
    if body.dry_run:
        return plan
    dest = Path(body.dest.strip()).expanduser()
    if not body.dest.strip() or not dest.is_absolute() or (dest.exists() and not dest.is_dir()):
        raise HTTPException(400, f"choose a full folder path, not {body.dest!r}")
    return {"job_id": jobs.start(execute_export, plan["copies"], dest)}
