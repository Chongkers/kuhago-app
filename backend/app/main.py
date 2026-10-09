from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config, jobs
from app.routes import coverage, dialog, events, export, finals, ingest, media, owl, search, shot_items, xmp
from ml import clip_engine, vad


@asynccontextmanager
async def lifespan(app: FastAPI):
    clip_engine.load()  # once, never per request
    vad.load()
    # encode every preset's prompts now, so the first page load doesn't wait for them
    clip_engine.embed_texts([
        *(p for t in events.TEMPLATES.values() for m in t["moments"] for p in m["prompts"]),
        *config.BACKGROUND_PROMPTS, *config.TALK_PROMPTS, *config.SCENE_TAGS,
    ])
    dialog.warm()
    yield
    dialog.close()


app = FastAPI(title="Kuha", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(events.router)
app.include_router(coverage.router)
app.include_router(ingest.router)
app.include_router(export.router)
app.include_router(media.router)
app.include_router(search.router)
app.include_router(shot_items.router)
app.include_router(finals.router)
app.include_router(xmp.router)
app.include_router(owl.router)
app.include_router(dialog.router)
app.include_router(jobs.router)

# The built UI (npm run build), so one server is the whole app. Mounted last: API routes win.
UI = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if UI.is_dir():
    app.mount("/", StaticFiles(directory=UI, html=True), name="ui")
