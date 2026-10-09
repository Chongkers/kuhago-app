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


class _FakeRaw:
    """Stands in for rawpy.RawPy: a camera RAW whose embedded preview is `thumb`."""

    def __init__(self, thumb, flip=0):
        self.thumb, self.sizes = thumb, type("S", (), {"flip": flip})

    def __enter__(self):
        return self

    def __exit__(self, *a):
        pass

    def extract_thumb(self):
        if isinstance(self.thumb, Exception):
            raise self.thumb
        return self.thumb


def _jpeg_bytes(size, dt=None):
    import io

    buf = io.BytesIO()
    Image.new("RGB", size, (0, 0, 255)).save(buf, "JPEG", exif=_exif(dt))
    return buf.getvalue()


def test_raw_uses_embedded_jpeg_with_its_date_and_camera_rotation(tmp_path, monkeypatch):
    import rawpy

    src = tmp_path / "IMG_0001.CR3"
    src.write_bytes(b"raw sensor data")
    thumb = rawpy.Thumbnail(rawpy.ThumbFormat.JPEG, _jpeg_bytes((60, 40), "2026:02:14 18:00:00"))
    monkeypatch.setattr(previews.rawpy, "imread", lambda p: _FakeRaw(thumb, flip=6))  # shot in portrait
    out, taken_at = previews.make_preview(src, tmp_path / "previews")
    with Image.open(out) as img:
        assert img.size == (40, 60)
    assert taken_at == "2026-02-14T18:00:00"


def test_raw_bitmap_thumb(tmp_path, monkeypatch):
    import numpy as np
    import rawpy

    src = tmp_path / "DSC_0002.NEF"
    src.write_bytes(b"raw")
    thumb = rawpy.Thumbnail(rawpy.ThumbFormat.BITMAP, np.zeros((10, 30, 3), np.uint8))
    monkeypatch.setattr(previews.rawpy, "imread", lambda p: _FakeRaw(thumb))
    out, _ = previews.make_preview(src, tmp_path / "previews")
    with Image.open(out) as img:
        assert img.size == (30, 10)


def test_raw_without_thumb_falls_back_to_exiftool(tmp_path, monkeypatch):
    import rawpy

    src = tmp_path / "A7_0003.ARW"
    src.write_bytes(b"raw")
    monkeypatch.setattr(previews.rawpy, "imread", lambda p: _FakeRaw(rawpy.LibRawNoThumbnailError()))
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return type("R", (), {"stdout": _jpeg_bytes((16, 12))})()

    monkeypatch.setattr(previews.subprocess, "run", fake_run)
    out, _ = previews.make_preview(src, tmp_path / "previews")
    assert calls[0][:3] == ["exiftool", "-b", "-PreviewImage"]
    with Image.open(out) as img:
        assert img.size == (16, 12)
