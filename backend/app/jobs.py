"""In-memory background jobs with SSE progress {stage, done, total}; shared by ingest/export/finals."""
import asyncio
import json
import logging
import threading
import uuid

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

log = logging.getLogger(__name__)
router = APIRouter()

_jobs: dict[str, list[dict]] = {}  # ponytail: never evicted, fine for a local single-user app


def start(fn, *args) -> str:
    """Runs fn(report, *args) on a thread; report(stage, done, total) appends a progress event."""
    job_id = uuid.uuid4().hex
    events = _jobs[job_id] = []

    def report(stage: str, done: int, total: int, **extra):
        events.append({"stage": stage, "done": done, "total": total, **extra})

    def run():
        try:
            fn(report, *args)
        except Exception as e:  # fail soft: the job ends, the server keeps running
            log.exception("job %s failed", job_id)
            report("error", 0, 0, message=str(e))
        report("done", 0, 0)

    threading.Thread(target=run, daemon=True).start()
    return job_id


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: str):
    events = _jobs.get(job_id)
    if events is None:
        raise HTTPException(404, "job not found")

    async def stream():
        sent = 0
        while True:
            while sent < len(events):
                yield {"data": json.dumps(events[sent])}
                sent += 1
                if events[sent - 1]["stage"] == "done":
                    return
            await asyncio.sleep(0.1)

    return EventSourceResponse(stream())
