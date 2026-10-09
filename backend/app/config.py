"""All tunable numbers and paths live here (AGENTS.md §10.10). No magic numbers in ML code."""
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
DATA_DIR = REPO_DIR / "data"
DB_PATH = DATA_DIR / "kuha.sqlite3"
TEMPLATES_DIR = BACKEND_DIR / "templates"


def event_dir(event_id: int) -> Path:
    return DATA_DIR / "events" / str(event_id)


# CLIP
CLIP_MODEL = "ViT-B-32"
CLIP_PRETRAINED = "laion2b_s34b_b79k"
EMB_DIM = 512
BATCH_SIZE = 32

# Moment classifier. CLIP cosines live in ~0.15-0.35; these are untuned guesses from proto/ (tune in A10).
TAU_SCORE = 0.18   # top1 below this -> "Unsorted"
TAU_MARGIN = 0.01  # top1 - top2 below this -> "Unsorted"
ALPHA_WITH_REFS = 0.4  # weight of text vs. example photos when examples exist; 1.0 otherwise
UNSORTED = "Unsorted"

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
