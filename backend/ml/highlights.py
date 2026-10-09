"""Lightweight personal curation (AGENTS.md Agent 5): sharpness, burst duplicates, highlights. Not pro culling."""
from collections import Counter
from pathlib import Path

import cv2
import imagehash
import numpy as np
from PIL import Image

from app import config


def sharpness(preview: Path) -> float:
    """Variance of the Laplacian on the grayscale preview; higher = sharper."""
    gray = cv2.imread(str(preview), cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError(f"unreadable preview: {preview}")
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def phash(preview: Path) -> int:
    with Image.open(preview) as img:
        return int(str(imagehash.phash(img)), 16)


def percentile_rank(values) -> np.ndarray:
    """0 = lowest in the event, 100 = highest. Ties broken by order."""
    v = np.asarray(values, float)
    if len(v) < 2:
        return np.full(len(v), 100.0)
    return np.argsort(np.argsort(v, kind="stable"), kind="stable") * 100.0 / (len(v) - 1)


def group_duplicates(moments: list[str], taken_at: list[float], hashes: list[int | None], emb: np.ndarray) -> list[int | None]:
    """Union-find over photos of the same moment taken ≤ DUP_MAX_SECONDS apart that look alike
    (pHash Hamming ≤ DUP_PHASH_MAX or cosine ≥ DUP_COS_MIN). Group id = lowest row in the group; None if alone."""
    parent = list(range(len(moments)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    order = sorted(range(len(moments)), key=lambda i: (moments[i], taken_at[i]))
    for a, i in enumerate(order):
        for j in order[a + 1 :]:
            if moments[j] != moments[i] or taken_at[j] - taken_at[i] > config.DUP_MAX_SECONDS:
                break
            near = hashes[i] is not None and hashes[j] is not None and (hashes[i] ^ hashes[j]).bit_count() <= config.DUP_PHASH_MAX
            if near or float(emb[i] @ emb[j]) >= config.DUP_COS_MIN:
                ri, rj = find(i), find(j)
                parent[max(ri, rj)] = min(ri, rj)

    roots = [find(i) for i in range(len(moments))]
    sizes = Counter(roots)
    return [r if sizes[r] > 1 else None for r in roots]


def pick_highlights(moments: list[str], sharp_pct: list[float], groups: list[int | None]) -> list[bool]:
    """Per moment: sharpest photo per duplicate group, drop the blurry ones, keep the top HIGHLIGHTS_PER_MOMENT."""
    best = {}  # (moment, group or own row) -> sharpest row
    for i, m in enumerate(moments):
        if m == config.UNSORTED or sharp_pct[i] < config.SHARPNESS_MIN_PCT:
            continue
        key = (m, i if groups[i] is None else groups[i])
        if key not in best or sharp_pct[i] > sharp_pct[best[key]]:
            best[key] = i
    by_moment = {}
    for (m, _), i in best.items():
        by_moment.setdefault(m, []).append(i)
    keep = {i for rows in by_moment.values() for i in sorted(rows, key=lambda i: -sharp_pct[i])[: config.HIGHLIGHTS_PER_MOMENT]}
    return [i in keep for i in range(len(moments))]
