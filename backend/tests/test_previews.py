import os

import pillow_heif
from PIL import Image

from media import previews


def _exif(dt=None, orientation=None):
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    if dt:
        exif.get_ifd(0x8769)[36867] = dt  # DateTimeOriginal
    return exif


def test_rotated_jpeg_renders_upright_and_reads_taken_at(tmp_path):
    src = tmp_path / "IMG_1.jpg"
    Image.new("RGB", (40, 20)).save(src, exif=_exif("2025:12:24 21:30:05", orientation=6))  # 6 = rotate 90° CW
    out, taken_at = previews.make_preview(src, tmp_path / "previews")
    with Image.open(out) as img:
        assert img.format == "JPEG" and img.size == (20, 40)
    assert taken_at == "2025-12-24T21:30:05"


def test_heic_and_downscale(tmp_path, monkeypatch):
    monkeypatch.setattr(previews.config, "PREVIEW_MAX_PX", 32)
    src = tmp_path / "IMG_2.HEIC"
    pillow_heif.from_pillow(Image.new("RGB", (64, 48), (200, 0, 0))).save(src)
    out, _ = previews.make_preview(src, tmp_path / "previews")
    with Image.open(out) as img:
        assert img.size == (32, 24)


def test_no_exif_falls_back_to_mtime_and_is_cached(tmp_path):
    src = tmp_path / "a.png"
    Image.new("RGB", (8, 8)).save(src)
    os.utime(src, (1735000000, 1735000000))
    out, taken_at = previews.make_preview(src, tmp_path / "previews")
    assert taken_at.startswith("2024-12-2")
    mtime = out.stat().st_mtime_ns
    assert previews.make_preview(src, tmp_path / "previews")[0] == out
    assert out.stat().st_mtime_ns == mtime  # second call reused the cached file
