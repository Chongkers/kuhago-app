"""Talking vs. scenery clips (AGENTS.md Agent 6): Silero VAD speech ratio + a CLIP "someone is talking" score."""
import wave
from pathlib import Path

import numpy as np
import torch

from app import config
from ml.clip_engine import embed_texts

_model = None


def load() -> None:
    """Once at startup, never per request. The weights ship inside the silero-vad package: no download."""
    global _model
    if _model is None:
        from silero_vad import load_silero_vad

        _model = load_silero_vad()


def speech_ratio(audio_path: Path) -> float:
    """speech_seconds / duration of a mono 16 kHz 16-bit WAV (media/video.extract_audio)."""
    from silero_vad import get_speech_timestamps

    with wave.open(str(audio_path), "rb") as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    if not len(pcm):
        return 0.0
    audio = torch.from_numpy(pcm.astype(np.float32) / 32768.0)
    spans = get_speech_timestamps(audio, _model, sampling_rate=config.AUDIO_SAMPLE_RATE)
    return float(sum(s["end"] - s["start"] for s in spans) / len(pcm))


def talk_scores(video_emb: np.ndarray) -> np.ndarray:
    """[N] cosine of each clip's embedding to the mean "someone is talking" prompt."""
    t = embed_texts(config.TALK_PROMPTS).mean(0)
    return video_emb @ (t / np.linalg.norm(t))


def pick_roll(ratio: float, score: float) -> str:
    """'A' = someone is talking (enough speech and it looks like it), else 'B'."""
    return "A" if ratio >= config.SPEECH_RATIO_MIN and score >= config.TAU_TALK else "B"
