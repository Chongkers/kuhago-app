"""Missed-moment check (AGENTS.md Agent 4)."""
import numpy as np

from app import config
from ml.classifier import ShotItem, score_matrix


def compute_coverage(emb: np.ndarray, items: list[ShotItem], media_ids: list[int], moments: list[str]) -> list[dict]:
    """One entry per shot item, missed first. `moments[i]` is the label already assigned to media row i."""
    S = score_matrix(emb, items)
    out = []
    for j, it in enumerate(items):
        col = S[:, j]
        best = float(col.max()) if len(col) else 0.0
        count = moments.count(it.moment)
        top = np.argsort(-col, kind="stable")[: config.COVERAGE_CANDIDATES]
        out.append({
            "moment": it.moment,
            "covered": count > 0 or best >= config.TAU_COV,
            "count": count,
            "best_score": best,
            "candidates": [media_ids[i] for i in top],
        })
    return sorted(out, key=lambda c: c["covered"])  # stable: template order within each group
