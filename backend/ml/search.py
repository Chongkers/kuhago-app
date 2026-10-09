"""Text search over CLIP embeddings (AGENTS.md Agent 7)."""
import numpy as np

from app import config
from ml.clip_engine import embed_texts


def top_k(emb: np.ndarray, query: str, k: int = config.SEARCH_K) -> list[tuple[int, float]]:
    """(row, cosine) of the k rows most similar to the query, best first."""
    if not len(emb):
        return []
    s = emb @ embed_texts([query])[0]
    return [(int(i), float(s[i])) for i in np.argsort(-s)[:k]]
