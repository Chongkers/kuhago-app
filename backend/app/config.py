"""All tunable numbers and paths live here (AGENTS.md §10.10). No magic numbers in ML code."""
import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent

# Kuha.exe (PyInstaller, see build.ps1): the files it ships with are read-only and sit beside the exe, and whatever
# the user creates goes under %LOCALAPPDATA%\Kuha. A dev checkout keeps everything in the repo, as before.
FROZEN = getattr(sys, "frozen", False)
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", BACKEND_DIR))  # templates, the built UI
APP_DIR = Path(sys.executable).parent if FROZEN else REPO_DIR  # models/ and tools/ in a build
USER_DIR = Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "Kuha"
DATA_DIR = Path(os.environ.get("KUHA_DATA_DIR") or (USER_DIR / "data" if FROZEN else REPO_DIR / "data"))
DB_PATH = DATA_DIR / "kuha.sqlite3"
LOG_PATH = USER_DIR / "logs" / "kuha.log"  # Kuha.exe has no console; this is where its output goes
WEBVIEW_DIR = USER_DIR / "webview"  # Kuha.exe's window keeps its browser storage here: chats, the profile
TEMPLATES_DIR = RESOURCE_DIR / "templates"
UI_DIR = RESOURCE_DIR / "ui" if FROZEN else REPO_DIR / "frontend" / "dist"  # `vite build`; served when it exists
TOOLS_DIR = APP_DIR / "tools"
CLIP_WEIGHTS = APP_DIR / "models" / "open_clip_model.safetensors"  # shipped in a build; else the Hugging Face cache

APP_HOST = "127.0.0.1"
APP_PORT = 8765  # Kuha.exe only. Fixed: the browser keeps chats and settings per address, port included
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # creationflags: a helper program never flashes a console


def tool(name: str) -> str:
    """FFmpeg, ffprobe or ExifTool: the copy shipped beside Kuha.exe if there is one, else whatever is on PATH."""
    bundled = TOOLS_DIR / f"{name}.exe"
    return str(bundled) if bundled.exists() else name


def event_dir(event_id: int) -> Path:
    return DATA_DIR / "events" / str(event_id)


# CLIP
CLIP_MODEL = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"
EMB_DIM = 512
BATCH_SIZE = 32
TEXT_CACHE_MAX = 4096  # cached text embeddings (2 KB each); search queries fill it, so it is emptied when full

# Moment classifier. CLIP cosines live in ~0.15-0.35; these are untuned guesses from proto/ (tune in A10).
TAU_SCORE = 0.18   # top1 below this -> "Unsorted"
TAU_MARGIN = 0.01  # top1 - top2 below this -> "Unsorted"
ALPHA_WITH_REFS = 0.4  # weight of text vs. example photos when examples exist; 1.0 otherwise
UNSORTED = "Unsorted"
# Captions that fit any photo. A photo that matches its best moment no better than the best of these is off-theme
# (concert photos in a Birthday event), so it stays "Unsorted". Checked on one off-theme folder only.
BACKGROUND_PROMPTS = ["a photo", "a photo of people"]
TAU_BACKGROUND = 0.0  # top1 must beat the best background caption by at least this

# Missed-moment check
TAU_COV = 0.22
COVERAGE_CANDIDATES = 3

# Highlights + burst duplicates
DUP_MAX_SECONDS = 10
DUP_PHASH_MAX = 8      # pHash Hamming distance (of 64 bits)
DUP_COS_MIN = 0.95
SHARPNESS_MIN_PCT = 20  # percentile rank within the event; below = too blurry for highlights
HIGHLIGHTS_PER_MOMENT = 5

# Previews
PREVIEW_MAX_PX = 1024
PREVIEW_JPEG_QUALITY = 85
THUMB_MAX_PX = 400  # grid tiles; the 1024 px preview is far more than a tile shows
THUMB_JPEG_QUALITY = 80
THUMB_MAX_AGE = 31536000  # seconds; thumb URLs carry a version, so the browser may keep them

# Search
SEARCH_K = 24

# Pro: photos rated at least this (or flagged is_select) are selects
SELECT_MIN_RATING = 3

# Talking vs. scenery clips
VIDEO_FRAME_FPS = 0.5
VIDEO_FRAME_WIDTH = 448
AUDIO_SAMPLE_RATE = 16000
SPEECH_RATIO_MIN = 0.35
TAU_TALK = 0.18  # untuned guess, same scale as TAU_SCORE
TALK_PROMPTS = ["a person talking to the camera", "a person giving a speech"]
FFMPEG_TIMEOUT = 600  # seconds per video

# Pro: finals matching
FINALS_TOP_K = 5
FINALS_PHASH_MAX = 12   # pHash Hamming distance (of 64 bits)
FINALS_COS_MIN = 0.92

# Pro: XMP sidecars
XMP_BACKUP_DIR = ".kuha_backup"
XMP_ROOT_KEYWORD = "Kuha"
EXIFTOOL_TIMEOUT = 300  # seconds per batched call

# Ask the owl: Ollama on this machine only, never a remote host
OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL = "llama3.2:3b"  # used when the page doesn't pick an installed one
OLLAMA_TIMEOUT = 120  # seconds; a small model on CPU can be slow to answer
OLLAMA_STATUS_TIMEOUT = 3  # seconds; "is it running?" should never hang the page
OLLAMA_PROMPT_TIMEOUT = 30  # seconds; describing one new moment must not hold up adding it
OWL_SAMPLE_PHOTOS = 4    # previews shown to a model that can see, spread over the event
OWL_TOP_TAGS = 8         # scene tags (below) handed to the model
OWL_MAX_SUGGESTIONS = 6
OWL_PROMPTS_PER_MOMENT = 3
OWL_SUGGESTION_PROMPTS = 2  # captions per suggested moment; fewer than a typed moment gets, to keep the reply short
OWL_JSON_MAX_TOKENS = 500   # cap on a JSON reply: a small model otherwise sometimes writes on for minutes
OWL_HISTORY_MESSAGES = 12   # last messages of a chat sent to the model; older ones would crowd out the facts
OWL_FIND_PHOTOS = 6         # photos shown under a reply when the user asks to find something
MOMENT_NAME_MAX = 60
# What CLIP can see in a photo, in plain words. The owl reads the most common ones in an event to work out
# what the event really was, whether or not its model can look at photos.
SCENE_TAGS = [
    "a band playing music on a stage", "a singer holding a microphone", "a crowd at a concert",
    "a person playing a guitar", "a person playing drums", "stage lights in a dark venue",
    "people dancing", "a person giving a speech", "an audience sitting and listening",
    "a group of people posing for a photo", "a portrait of one person", "a selfie",
    "a couple posing together", "children playing", "a baby", "elderly people",
    "people eating at a table", "a table full of food", "a cake", "drinks and glasses on a table",
    "wrapped gifts", "balloons and party decorations", "flowers", "candles",
    "a church interior", "a priest at an altar", "a bride in a wedding dress", "people in formal clothes",
    "graduates in caps and gowns", "a classroom", "people working at laptops", "a presentation on a screen",
    "a sports game", "people playing a game", "a beach", "a swimming pool", "mountains and scenery",
    "a city street", "a car or bus", "an airport or airplane", "a restaurant", "a house interior",
    "pets and animals", "a sunset", "a building exterior", "people walking outdoors",
]

# Ingest
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}
RAW_EXTS = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2"}
VIDEO_EXTS = {".mp4", ".mov"}


def pick_device() -> str:
    import torch  # deferred so importing config never pulls in torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"
