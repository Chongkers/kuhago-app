"""CLIP singleton (AGENTS.md Agent 2). `load()` runs once at startup; tests swap `_model` for a fake."""
import logging
import os
import threading
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from app import config

register_heif_opener()
log = logging.getLogger(__name__)

_model = None


class _Clip:
    def __init__(self):
        os.environ.setdefault("HF_HUB_OFFLINE", "1")  # weights come from scripts/download_models.py only
        import open_clip

        self.device = config.pick_device()
        model, _, self.preprocess = open_clip.create_model_and_transforms(
            config.CLIP_MODEL, pretrained=config.CLIP_PRETRAINED, device=self.device
        )
        self.model = model.eval()
        self.tokenize = open_clip.get_tokenizer(config.CLIP_MODEL)

    def encode_image(self, x):
        return self.model.encode_image(x.to(self.device))

    def encode_text(self, t):
        return self.model.encode_text(t.to(self.device))


def load() -> None:
    global _model
    if _model is None:
        _model = _Clip()


def _norm(x: torch.Tensor) -> np.ndarray:
    x = x.float().cpu().numpy()
    return x / np.linalg.norm(x, axis=-1, keepdims=True)


@torch.inference_mode()
def embed_images(paths: list[Path]) -> tuple[list[Path], np.ndarray]:
    """Returns (paths that embedded, [len(ok), EMB_DIM] unit rows). Unreadable files are logged and skipped."""
    ok, out = [], []
    for i in range(0, len(paths), config.BATCH_SIZE):
        batch = []
        for p in paths[i : i + config.BATCH_SIZE]:
            try:
                with Image.open(p) as img:
                    batch.append(_model.preprocess(ImageOps.exif_transpose(img).convert("RGB")))
                ok.append(p)
            except Exception as e:
                log.warning("skip %s: %s", p, e)
        if batch:
            out.append(_norm(_model.encode_image(torch.stack(batch))))
    if not out:
        return ok, np.zeros((0, config.EMB_DIM), np.float32)
    return ok, np.concatenate(out)


_text_cache: dict[str, np.ndarray] = {}
_text_cache_model = None  # the model the cache was filled by; tests swap `_model`
_text_lock = threading.Lock()  # requests run in threads; one may empty the cache while another reads it


@torch.inference_mode()
def embed_texts(texts: list[str]) -> np.ndarray:
    """Unit rows, one per text. Cached per string: the same moment prompts are scored on every page load,
    and encoding them again each time is what made the app slow on a laptop CPU."""
    global _text_cache_model
    with _text_lock:
        if _text_cache_model is not _model or len(_text_cache) > config.TEXT_CACHE_MAX:
            _text_cache.clear()
            _text_cache_model = _model
        new = [t for t in dict.fromkeys(texts) if t not in _text_cache]
        for i in range(0, len(new), config.BATCH_SIZE):
            batch = new[i : i + config.BATCH_SIZE]
            _text_cache.update(zip(batch, _norm(_model.encode_text(_model.tokenize(batch)))))
        if not texts:
            return np.zeros((0, config.EMB_DIM), np.float32)
        return np.stack([_text_cache[t] for t in texts])
