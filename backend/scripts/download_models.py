"""The only script allowed to use the network: caches model weights so the app runs offline.

  cd backend && python scripts/download_models.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # so `app` imports when run as a file (README)

import open_clip  # noqa: E402

from app import config  # noqa: E402

open_clip.create_model_and_transforms(config.CLIP_MODEL, pretrained=config.CLIP_PRETRAINED)
print(f"cached {config.CLIP_MODEL} / {config.CLIP_PRETRAINED}")
