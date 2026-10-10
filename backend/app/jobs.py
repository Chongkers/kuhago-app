"""In-memory background jobs with SSE progress {stage, done, total}; shared by ingest/export/finals.
A job can be asked to stop (POST /jobs/{id}/cancel) and does so at its next checkpoint()."""
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
_cancelled: set[str] = set()  # job ids the user asked to stop


class Cancelled(Exception):
    """Raised inside a job by checkpoint() once the user asked it to stop."""


def start(fn, *args) -> str:
    """Runs fn(report, *args) on a thread; report(stage, done, total) appends a progress event."""
    job_id = uuid.uuid4().hex
    events = _jobs[job_id] = []

    def report(stage: str, done: int, total: int, **extra):
        events.append({"stage": stage, "done": done, "total": total, **extra})

    report.job_id = job_id  # how checkpoint() knows which job is asking

    def run():
        try:
            fn(report, *args)
        except Cancelled:
            report("cancelled", 0, 0)
        except Exception as e:  # fail soft: the job ends, the server keeps running
            log.exception("job %s failed", job_id)
            report("error", 0, 0, message=str(e))
        report("done", 0, 0)

    threading.Thread(target=run, daemon=True).start()
    return job_id


def checkpoint(report) -> None:
    """A job calls this between steps it can be stopped at, before it has saved anything."""
    if getattr(report, "job_id", None) in _cancelled:
        raise Cancelled()


def running() -> int:
    """Jobs that have not reported `done` yet. Kuha.exe asks before quitting while there are any."""
    return sum(1 for events in list(_jobs.values()) if not events or events[-1]["stage"] != "done")


@router.post("/jobs/{job_id}/cancel")
def cancel(job_id: str):
    """Asks a job to stop. It ends with a `cancelled` event at its next checkpoint; one that is already past its
    last checkpoint finishes as usual."""
    if job_id not in _jobs:
        raise HTTPException(404, "job not found")
    _cancelled.add(job_id)
    return {"cancelling": True}


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
