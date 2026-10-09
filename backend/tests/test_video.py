"""Videos: FFmpeg frames + audio, Silero speech ratio, talking/scenery roll, and ingest end to end."""
import shutil
import subprocess
import wave

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config
from app.routes import ingest
from media import video
from ml import vad
from test_ingest_search import _event, _ingest, e, fake_embed_texts, fakes  # noqa: F401  (fakes is autouse)

needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="FFmpeg not on PATH")


def test_pick_roll_needs_speech_and_a_talking_look(monkeypatch):
    monkeypatch.setattr(config, "SPEECH_RATIO_MIN", 0.35)
    monkeypatch.setattr(config, "TAU_TALK", 0.2)
    assert vad.pick_roll(0.5, 0.3) == "A"
    assert vad.pick_roll(0.5, 0.1) == "B"  # music or crowd noise over scenery
    assert vad.pick_roll(0.1, 0.3) == "B"  # a person on screen, nobody speaking


def test_talk_scores(monkeypatch):
    monkeypatch.setattr(vad, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(config, "TALK_PROMPTS", ["axis:0", "axis:0"])
    assert vad.talk_scores(np.stack([e(0), e(2)])).tolist() == pytest.approx([1.0, 0.0])


def test_speech_ratio_of_silence_is_zero(tmp_path):
    vad.load()
    wav = tmp_path / "silence.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(config.AUDIO_SAMPLE_RATE)
        w.writeframes(np.zeros(config.AUDIO_SAMPLE_RATE * 2, np.int16).tobytes())
    assert vad.speech_ratio(wav) == 0.0


def _make_clip(path, seconds=4, audio=True):
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size=320x240:rate=10"]
    if audio:
        cmd += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    subprocess.run([*cmd, "-pix_fmt", "yuv420p", str(path)], check=True)
    return path


@needs_ffmpeg
def test_ffmpeg_frames_and_audio(tmp_path):
    clip = _make_clip(tmp_path / "clip.mp4")
    frames = video.extract_frames(clip, tmp_path / "frames")
    assert len(frames) == 2  # 4 s at one frame every 2 s
    with Image.open(frames[0]) as img:
        assert img.width == config.VIDEO_FRAME_WIDTH
    wav = video.extract_audio(clip, tmp_path / "a.wav")
    with wave.open(str(wav), "rb") as w:
        assert (w.getnchannels(), w.getframerate()) == (1, config.AUDIO_SAMPLE_RATE)
    assert video.extract_audio(_make_clip(tmp_path / "mute.mp4", audio=False), tmp_path / "b.wav") is None
    assert len(video.extract_frames(_make_clip(tmp_path / "short.mp4", seconds=1), tmp_path / "f2")) >= 1
    assert video.taken_at(clip)[:4].isdigit()


def test_ingest_videos_get_a_roll_and_bad_ones_are_skipped(tmp_path, monkeypatch):
    """FFmpeg and the VAD are faked: a red clip with speech -> talking, a green silent one -> scenery."""
    from app.main import app

    def fake_frames(src, out_dir):
        if src.name == "broken.mp4":
            raise ValueError("not a video")
        out_dir.mkdir(parents=True, exist_ok=True)
        color = (255, 0, 0) if "toast" in src.name else (0, 255, 0)
        for i in range(2):
            Image.new("RGB", (8, 8), color).save(out_dir / f"{i:04d}.jpg")
        return sorted(out_dir.glob("*.jpg"))

    monkeypatch.setattr(ingest, "extract_frames", fake_frames)
    monkeypatch.setattr(ingest, "extract_audio", lambda src, out: out if "toast" in src.name else None)
    monkeypatch.setattr(ingest, "video_taken_at", lambda src: "2026-10-09T19:00:00")
    monkeypatch.setattr(vad, "speech_ratio", lambda wav: 0.8)
    monkeypatch.setattr(vad, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(config, "TALK_PROMPTS", ["axis:0"])

    folder = tmp_path / "phone"
    folder.mkdir()
    for name in ("toast.MOV", "venue.mp4", "broken.mp4"):
        (folder / name).write_bytes(b"x")
    Image.new("RGB", (8, 8), (255, 0, 0)).save(folder / "cake.jpg")

    client = TestClient(app, base_url="http://testserver/api")
    ev = _event()
    progress = _ingest(client, ev, [folder])
    assert progress[-1]["stage"] == "done" and not [p for p in progress if p["stage"] == "error"]
    assert {"stage": "videos", "done": 3, "total": 3} in progress

    media = {m["path"].rsplit("\\", 1)[-1].rsplit("/", 1)[-1]: m for m in client.get(f"/events/{ev}/media").json()}
    assert sorted(media) == ["cake.jpg", "toast.MOV", "venue.mp4"]
    toast, venue = media["toast.MOV"], media["venue.mp4"]
    assert (toast["kind"], toast["roll"], toast["speech_ratio"], toast["moment"]) == ("video", "A", 0.8, "Cake")
    assert (venue["kind"], venue["roll"], venue["speech_ratio"], venue["moment"]) == ("video", "B", 0.0, "Group Photo")
    assert media["cake.jpg"]["roll"] is None and not toast["is_highlight"]  # highlights are photos only
    assert client.get(f"/media/{toast['id']}/preview").status_code == 200
    assert [m["path"] for m in client.get(f"/events/{ev}/media", params={"roll": "A"}).json()] == [toast["path"]]
    assert list((config.event_dir(ev) / "frames").glob("*")) == []  # scratch frames are cleaned up
