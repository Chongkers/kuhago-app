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

# Previews
PREVIEW_MAX_PX = 1024

# Search
SEARCH_K = 24

# Ingest
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}


def pick_device() -> str:
    import torch  # deferred so importing config never pulls in torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"
