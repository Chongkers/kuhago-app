from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import jobs
from app.routes import coverage, events, ingest, media, search
from ml import clip_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    clip_engine.load()  # once, never per request
    yield


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
app.include_router(media.router)
app.include_router(search.router)
app.include_router(jobs.router)
