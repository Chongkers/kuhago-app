from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

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
# CORS is for the Vite dev server only; the built UI is served from this same address and needs none
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
# Everything the engine answers is under /api: the UI's own pages (/events, /owl, ...) have the same paths, and in
# a build one server serves both.
api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    """What the UI asks when it opens: that the engine answers (the models are loaded before it does), which
    helper programs are missing, and the numbers its pages quote."""
    return {
        "ready": True,
        "ffmpeg": config.has_tool("ffmpeg"),
        "exiftool": config.has_tool("exiftool"),
        "highlights_per_moment": config.HIGHLIGHTS_PER_MOMENT,
        "select_min_rating": config.SELECT_MIN_RATING,
    }


for module in (events, coverage, ingest, export, media, search, shot_items, finals, xmp, owl, dialog, jobs):
    api.include_router(module.router)
app.include_router(api)


@app.get("/{path:path}", include_in_schema=False)
def ui(path: str):
    """The built UI (`vite build`). Any path that is not a file is one of its pages, so it gets index.html and
    refreshing the browser on /events/3 works. Under the Vite dev server there is no build and this is a 404."""
    if path == "api" or path.startswith("api/") or not config.UI_DIR.is_dir():
        raise HTTPException(404, "There's nothing at this address.")
    file = (config.UI_DIR / path).resolve()
    if path and file.is_file() and file.is_relative_to(config.UI_DIR.resolve()):
        return FileResponse(file)
    return FileResponse(config.UI_DIR / "index.html", headers={"Cache-Control": "no-cache"})  # a new build shows at once
