"""Phone photo or camera RAW -> cached upright preview JPEG + capture time (AGENTS.md Agent 1).
Originals are only read."""
import hashlib
import subprocess
from datetime import datetime
from io import BytesIO
from pathlib import Path

import rawpy
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

from app import config

register_heif_opener()

_EXIF_IFD, _DATETIME_ORIGINAL, _DATETIME = 0x8769, 36867, 306
_RAW_FLIP = {3: Image.Transpose.ROTATE_180, 5: Image.Transpose.ROTATE_90, 6: Image.Transpose.ROTATE_270}  # LibRaw sizes.flip


def _taken_at(img: Image.Image, src: Path) -> str:
    exif = img.getexif()
    # RAW embedded previews (e.g. CR3) carry only IFD0 DateTime, not DateTimeOriginal
    for raw in (exif.get_ifd(_EXIF_IFD).get(_DATETIME_ORIGINAL), exif.get(_DATETIME)):
        try:
            return datetime.strptime(str(raw).strip("\x00 "), "%Y:%m:%d %H:%M:%S").isoformat()
        except ValueError:
            continue
    return datetime.fromtimestamp(src.stat().st_mtime).isoformat(timespec="seconds")


def _open_raw(src: Path) -> tuple[Image.Image, int]:
    """The camera's embedded preview (no demosaicing) + LibRaw's rotation code. Fallback: ExifTool."""
    flip = 0
    try:
        with rawpy.imread(str(src)) as raw:
            flip, thumb = raw.sizes.flip, raw.extract_thumb()
        if thumb.format == rawpy.ThumbFormat.JPEG:
            return Image.open(BytesIO(thumb.data)), flip
        return Image.fromarray(thumb.data), flip
    except rawpy.LibRawError:
        cmd = [config.tool("exiftool"), "-b", "-PreviewImage", str(src)]
        out = subprocess.run(cmd, capture_output=True, check=True, timeout=60, creationflags=config.NO_WINDOW).stdout
        return Image.open(BytesIO(out)), flip


def make_preview(src: Path, out_dir: Path) -> tuple[Path, str]:
    """Returns (preview path, ISO taken_at). Raises on unreadable files; callers skip them."""
    out = out_dir / (hashlib.sha1(str(src).encode()).hexdigest()[:20] + ".jpg")
    is_raw = src.suffix.lower() in config.RAW_EXTS
    img, flip = _open_raw(src) if is_raw else (Image.open(src), 0)
    with img:
        taken_at = _taken_at(img, src)
        if not out.exists():
            if is_raw:  # RAW orientation lives in the RAW container, not its embedded preview
                preview = img.transpose(_RAW_FLIP[flip]) if flip in _RAW_FLIP else img
            else:
                preview = ImageOps.exif_transpose(img)
            preview = preview.convert("RGB")
            preview.thumbnail((config.PREVIEW_MAX_PX, config.PREVIEW_MAX_PX))
            out_dir.mkdir(parents=True, exist_ok=True)
            tmp = out.with_suffix(".tmp")
            preview.save(tmp, "JPEG", quality=config.PREVIEW_JPEG_QUALITY)
            tmp.replace(out)  # never leave a half-written preview that looks cached
    return out, taken_at
