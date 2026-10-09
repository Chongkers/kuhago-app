"""The only script allowed to use the network: caches model weights so the app runs offline.

  cd backend && .venv/bin/python -m scripts.download_models
"""
import open_clip

from app import config

open_clip.create_model_and_transforms(config.CLIP_MODEL, pretrained=config.CLIP_PRETRAINED)
print(f"cached {config.CLIP_MODEL} / {config.CLIP_PRETRAINED}")
