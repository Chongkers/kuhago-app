"""Finals matcher (AGENTS.md Agent 8, Pro): which select was each edited final made from?"""
import numpy as np

from app import config


def match_finals(
    final_emb: np.ndarray, final_hashes: list[int | None], select_emb: np.ndarray, select_hashes: list[int | None]
) -> list[tuple[int | None, float]]:
    """Per final: (row of its select or None, CLIP cosine to the best candidate). Among the FINALS_TOP_K selects
    by cosine, the lowest pHash Hamming distance wins if it is close enough; otherwise (a heavy edit or crop
    breaks the pHash) the top cosine wins if that is close enough."""
    if not len(select_emb):
        return [(None, 0.0)] * len(final_emb)
    out = []
    for cos, fh in zip(final_emb @ select_emb.T, final_hashes):
        def hamming(j):
            return 64 if fh is None or select_hashes[j] is None else (fh ^ select_hashes[j]).bit_count()

        top = np.argsort(-cos, kind="stable")[: config.FINALS_TOP_K]
        best = int(min(top, key=hamming))  # min is stable: ties keep the higher cosine
        if hamming(best) > config.FINALS_PHASH_MAX:
            best = int(top[0])
            if cos[best] < config.FINALS_COS_MIN:
                out.append((None, float(cos[best])))
                continue
        out.append((best, float(cos[best])))
    return out
