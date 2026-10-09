"""Moment classifier (AGENTS.md Agent 3). score_matrix is shared with ml/coverage."""
from collections import Counter
from dataclasses import dataclass

import numpy as np

from app import config
from ml.clip_engine import embed_texts


@dataclass
class ShotItem:
    moment: str
    prompts: list[str]
    ref_emb: np.ndarray | None = None  # [K, EMB_DIM] unit rows of its example photos
    required: bool = True  # a must-have: only these can be reported as missed


def _unit(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def _on_text_scale(r: np.ndarray, r_pop: np.ndarray, t_pop: np.ndarray) -> np.ndarray:
    """Example-photo cosines moved onto the text cosines' scale (same mean and spread over the event).
    Photo-to-photo cosines sit far above photo-to-text ones, so blended raw they would hand every photo to
    whichever moment has examples. Rescaled, examples only re-rank photos within their moment."""
    spread = r_pop.std() if len(r_pop) > 1 else 0.0
    if spread <= np.finfo(np.float32).eps:  # one photo, or all alike: the examples say nothing yet
        return np.full(len(r), t_pop.mean() if len(t_pop) else 0.0, np.float32)
    return t_pop.mean() + (r - r_pop.mean()) * (t_pop.std() / spread)


def score_matrix(emb: np.ndarray, items: list[ShotItem], pop: np.ndarray | None = None) -> np.ndarray:
    """[N media, M moments] of α·cos(x, T_m) + (1−α)·cos'(x, R_m), where cos' is the example-photo cosine
    on the text scale. `pop` = all of the event's media embeddings (default: emb), the population for that scale."""
    pop = emb if pop is None else pop
    cols = []
    for it in items:
        text = _unit(embed_texts(it.prompts).mean(0))
        s = emb @ text
        if it.ref_emb is not None and len(it.ref_emb):
            a, ref = config.ALPHA_WITH_REFS, _unit(it.ref_emb.mean(0))
            s = a * s + (1 - a) * _on_text_scale(emb @ ref, pop @ ref, pop @ text)
        cols.append(s)
    return np.stack(cols, axis=1) if cols else np.zeros((len(emb), 0), np.float32)


def background_floor(emb: np.ndarray) -> np.ndarray:
    """Per media row, the score a moment has to reach to mean anything: the best cosine with a caption that
    fits any photo, plus TAU_BACKGROUND. -inf when no background captions are configured."""
    if not config.BACKGROUND_PROMPTS or not len(emb):
        return np.full(len(emb), -np.inf, np.float32)
    return (emb @ embed_texts(config.BACKGROUND_PROMPTS).T).max(axis=1) + config.TAU_BACKGROUND


def classify_moments(emb: np.ndarray, items: list[ShotItem], pop: np.ndarray | None = None) -> list[tuple[str, float]]:
    """(moment, top1 − top2) per media row; "Unsorted" when top1 or the margin is too low, or when the photo
    fits its best moment no better than it fits "a photo" (off-theme)."""
    if not items:
        return [(config.UNSORTED, 0.0)] * len(emb)
    S = score_matrix(emb, items, pop)
    top = np.sort(S, axis=1)
    seconds = top[:, -2] if S.shape[1] > 1 else np.zeros(len(S))  # a lone moment's margin is top1
    out = []
    for row, first, second, floor in zip(S, top[:, -1], seconds, background_floor(emb)):
        conf = float(first - second)
        ok = first >= config.TAU_SCORE and conf >= config.TAU_MARGIN and first >= floor
        out.append((items[int(row.argmax())].moment if ok else config.UNSORTED, conf))
    return out


def classify_clip(frames: np.ndarray, items: list[ShotItem], pop: np.ndarray | None = None) -> tuple[str, float, int]:
    """A video's (moment, confidence, index of the frame that stands for it). Each sampled frame is classified like
    a photo and the clip takes the moment most of its sorted frames got. The mean of the frames would keep only what
    they share ("a photo of people") and send nearly every clip to Unsorted."""
    labels = classify_moments(frames, items, pop)
    votes = Counter(m for m, _ in labels if m != config.UNSORTED)
    if not votes:  # the frame most like the whole clip
        mean = frames.mean(0)
        return config.UNSORTED, max((c for _, c in labels), default=0.0), int((frames @ mean).argmax())
    moment = votes.most_common(1)[0][0]
    best = max((i for i, (m, _) in enumerate(labels) if m == moment), key=lambda i: labels[i][1])
    return moment, labels[best][1], best
