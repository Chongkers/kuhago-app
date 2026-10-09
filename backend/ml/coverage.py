"""Missed-moment check (AGENTS.md Agent 4)."""
import numpy as np

from app import config
from ml.classifier import ShotItem, background_floor, score_matrix


def compute_coverage(emb: np.ndarray, items: list[ShotItem], media_ids: list[int], moments: list[str]) -> list[dict]:
    """One entry per shot item, missed must-haves first. `moments[i]` is the label already assigned to media row i.
    A moment with no media is still covered by one strong photo, unless that photo is off-theme."""
    S = score_matrix(emb, items)
    floor = np.maximum(background_floor(emb), config.TAU_COV)
    out = []
    for j, it in enumerate(items):
        col = S[:, j]
        count = moments.count(it.moment)
        top = np.argsort(-col, kind="stable")[: config.COVERAGE_CANDIDATES]
        out.append({
            "moment": it.moment,
            "required": it.required,
            "covered": count > 0 or bool((col >= floor).any()),
            "count": count,
            "best_score": float(col.max()) if len(col) else 0.0,
            "candidates": [media_ids[i] for i in top],
        })
    # stable: template order within each group. Missed = a must-have with nothing found.
    return sorted(out, key=lambda c: (c["covered"] or not c["required"], c["covered"]))
