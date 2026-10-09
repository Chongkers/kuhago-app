"""Phone photo -> cached upright preview JPEG + capture time (AGENTS.md Agent 1). Originals are only read."""
import hashlib
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from app import config

register_heif_opener()

_EXIF_IFD, _DATETIME_ORIGINAL = 0x8769, 36867


def _taken_at(img: Image.Image, src: Path) -> str:
    raw = img.getexif().get_ifd(_EXIF_IFD).get(_DATETIME_ORIGINAL)
    try:
        return datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S").isoformat()
    except ValueError:
        return datetime.fromtimestamp(src.stat().st_mtime).isoformat(timespec="seconds")


def make_preview(src: Path, out_dir: Path) -> tuple[Path, str]:
    """Returns (preview path, ISO taken_at). Raises on unreadable files; callers skip them."""
    out = out_dir / (hashlib.sha1(str(src).encode()).hexdigest()[:20] + ".jpg")
    with Image.open(src) as img:
        taken_at = _taken_at(img, src)
        if not out.exists():
            preview = ImageOps.exif_transpose(img).convert("RGB")
            preview.thumbnail((config.PREVIEW_MAX_PX, config.PREVIEW_MAX_PX))
            out_dir.mkdir(parents=True, exist_ok=True)
            tmp = out.with_suffix(".tmp")
            preview.save(tmp, "JPEG", quality=config.PREVIEW_JPEG_QUALITY)
            tmp.replace(out)  # never leave a half-written preview that looks cached
    return out, taken_at
