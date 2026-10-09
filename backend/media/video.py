"""Video -> sampled frames + mono 16 kHz audio via FFmpeg (AGENTS.md Agent 1). Originals are only read."""
import subprocess
from datetime import datetime
from pathlib import Path

from app import config


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, check=True, timeout=config.FFMPEG_TIMEOUT)


def extract_frames(src: Path, out_dir: Path) -> list[Path]:
    """One frame every 1/VIDEO_FRAME_FPS seconds, in order. Raises if FFmpeg can't read the file."""
    out_dir.mkdir(parents=True, exist_ok=True)
    vf = f"fps={config.VIDEO_FRAME_FPS},scale={config.VIDEO_FRAME_WIDTH}:-1"
    _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vf", vf, str(out_dir / "%04d.jpg")])
    frames = sorted(out_dir.glob("*.jpg"))
    if not frames:  # shorter than one sampling interval
        _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-frames:v", "1",
              "-vf", f"scale={config.VIDEO_FRAME_WIDTH}:-1", str(out_dir / "0001.jpg")])
        frames = sorted(out_dir.glob("*.jpg"))
    if not frames:
        raise ValueError(f"no frames in {src}")
    return frames


def extract_audio(src: Path, out: Path) -> Path | None:
    """Mono 16 kHz WAV for the VAD, or None when the clip has no audio track."""
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        _run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-vn", "-ac", "1",
              "-ar", str(config.AUDIO_SAMPLE_RATE), str(out)])
    except subprocess.CalledProcessError:
        return None
    return out if out.exists() and out.stat().st_size > 0 else None


def taken_at(src: Path) -> str:
    """The container's creation time (stored in UTC) as local ISO time; fallback: file mtime."""
    try:
        cmd = ["ffprobe", "-v", "error", "-show_entries", "format_tags=creation_time", "-of", "csv=p=0", str(src)]
        raw = _run(cmd).stdout.decode().strip()
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone().replace(tzinfo=None).isoformat(timespec="seconds")
    except (OSError, ValueError, subprocess.SubprocessError):
        return datetime.fromtimestamp(src.stat().st_mtime).isoformat(timespec="seconds")
