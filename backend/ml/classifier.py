"""Moment classifier (AGENTS.md Agent 3). score_matrix is shared with ml/coverage."""
from dataclasses import dataclass

import numpy as np

from app import config
from ml.clip_engine import embed_texts


@dataclass
class ShotItem:
    moment: str
    prompts: list[str]
    ref_emb: np.ndarray | None = None  # [K, EMB_DIM] unit rows of its example photos


def _unit(v: np.ndarray) -> np.ndarray:
    return v / np.linalg.norm(v)


def score_matrix(emb: np.ndarray, items: list[ShotItem]) -> np.ndarray:
    """[N media, M moments] of α·cos(x, T_m) + (1−α)·cos(x, R_m)."""
    cols = []
    for it in items:
        s = emb @ _unit(embed_texts(it.prompts).mean(0))
        if it.ref_emb is not None and len(it.ref_emb):
            a = config.ALPHA_WITH_REFS
            s = a * s + (1 - a) * (emb @ _unit(it.ref_emb.mean(0)))
        cols.append(s)
    return np.stack(cols, axis=1) if cols else np.zeros((len(emb), 0), np.float32)


def classify_moments(emb: np.ndarray, items: list[ShotItem]) -> list[tuple[str, float]]:
    """(moment, top1 − top2) per media row; "Unsorted" when top1 or the margin is too low."""
    if not items:
        return [(config.UNSORTED, 0.0)] * len(emb)
    S = score_matrix(emb, items)
    top = np.sort(S, axis=1)
    seconds = top[:, -2] if S.shape[1] > 1 else np.zeros(len(S))  # a lone moment's margin is top1
    out = []
    for row, first, second in zip(S, top[:, -1], seconds):
        conf = float(first - second)
        ok = first >= config.TAU_SCORE and conf >= config.TAU_MARGIN
        out.append((items[int(row.argmax())].moment if ok else config.UNSORTED, conf))
    return out
