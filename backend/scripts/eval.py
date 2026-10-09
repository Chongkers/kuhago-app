"""Metrics vs. a labeled test set (AGENTS.md §9). Writes results.md at the repo root; never hand-edit it.

  cd backend && .venv/bin/python -m scripts.eval ../data/eval/personal_coco --template birthday

A set folder holds photos/, labels.csv (filename, moment, roll, dup_group) and optionally queries.csv
(query, filename; several rows per query = several right answers).
"""
import argparse
import csv
import platform
import time
from datetime import datetime
from itertools import combinations
from pathlib import Path

import numpy as np
import torch

from app import config
from app.routes.events import TEMPLATES
from media.previews import make_preview
from ml import clip_engine, highlights
from ml.classifier import ShotItem, classify_moments
from ml.coverage import compute_coverage
from ml.search import top_k

SEARCH_TOP = 5


def pair_scores(truth: list, pred: list) -> dict:
    """Pairwise precision/recall/F1 of duplicate grouping. None/'' = not in any group."""
    t = {(i, j) for i, j in combinations(range(len(truth)), 2) if truth[i] and truth[i] == truth[j]}
    p = {(i, j) for i, j in combinations(range(len(pred)), 2) if pred[i] is not None and pred[i] == pred[j]}
    prec = len(t & p) / len(p) if p else 1.0
    rec = len(t & p) / len(t) if t else 1.0
    return {"precision": prec, "recall": rec, "f1": 2 * prec * rec / (prec + rec) if prec + rec else 0.0,
            "true_pairs": len(t), "pred_pairs": len(p)}


def score_set(emb, labels: list[dict], taken_at: list[float], hashes: list, template: dict, queries: dict) -> dict:
    """All metrics from precomputed embeddings, so tests can feed synthetic vectors."""
    names = [r["filename"] for r in labels]
    truth = [r["moment"] for r in labels]
    items = [ShotItem(m["moment"], m["prompts"]) for m in template["moments"]]
    known = {it.moment for it in items}
    acc = lambda pred, rows: float(np.mean([pred[i] == truth[i] for i in rows])) if rows else float("nan")  # noqa: E731

    pred = [m for m, _ in classify_moments(emb, items)]
    out = {"n": len(labels), "moment_acc_text": acc(pred, range(len(labels)))}

    # Example photos: per moment, its first labeled photo (and that photo's burst frames) become the example;
    # both conditions are scored on the remaining photos so the numbers compare.
    examples = {}
    for i, r in enumerate(labels):
        if r["moment"] in known and r["moment"] not in examples and truth.count(r["moment"]) >= 2:
            examples[r["moment"]] = i
    leaked = {labels[i]["dup_group"] for i in examples.values() if labels[i]["dup_group"]}
    held = [i for i, r in enumerate(labels) if i not in examples.values() and not (r["dup_group"] and r["dup_group"] in leaked)]
    with_refs = [ShotItem(it.moment, it.prompts, emb[[examples[it.moment]]] if it.moment in examples else None) for it in items]
    out["examples"] = len(examples)
    out["held_out"] = len(held)
    out["moment_acc_text_held"] = acc(pred, held)
    out["moment_acc_refs_held"] = acc([m for m, _ in classify_moments(emb, with_refs)], held)

    # Missed moments: hide every photo of one moment at a time; the check should flag it.
    flagged = 0
    present = sorted(known & set(truth))
    for m in present:
        keep = [i for i in range(len(labels)) if truth[i] != m]
        cov = compute_coverage(emb[keep], items, keep, [pred[i] for i in keep])
        flagged += not next(c for c in cov if c["moment"] == m)["covered"]
    full = compute_coverage(emb, items, list(range(len(labels))), pred)
    out["missed_recall"] = (flagged, len(present))
    out["false_alarms"] = sorted(c["moment"] for c in full if not c["covered"] and c["moment"] in present)
    out["absent_flagged"] = sorted(c["moment"] for c in full if not c["covered"] and c["moment"] not in present)
    out["absent"] = sorted(known - set(truth))

    out["dups"] = pair_scores([r["dup_group"] for r in labels], highlights.group_duplicates(pred, taken_at, hashes, emb))

    hits = []
    for q, want in queries.items():
        got = {names[i] for i, _ in top_k(emb, q, SEARCH_TOP)}
        hits.append(bool(got & want))
    out["search"] = (sum(hits), len(hits))
    return out


def embed_set(set_dir: Path) -> tuple:
    labels = list(csv.DictReader(open(set_dir / "labels.csv", encoding="utf-8")))
    cache = set_dir / ".cache" / "previews"
    start = time.perf_counter()
    prev = [make_preview(set_dir / "photos" / r["filename"], cache) for r in labels]
    ok, emb = clip_engine.embed_images([p for p, _ in prev])
    secs = time.perf_counter() - start
    if len(ok) != len(labels):
        raise SystemExit(f"{len(labels) - len(ok)} photos failed to embed; fix the set first")
    taken = [datetime.fromisoformat(t).timestamp() for _, t in prev]
    hashes = [highlights.phash(p) for p, _ in prev]
    queries = {}
    if (set_dir / "queries.csv").exists():
        for r in csv.DictReader(open(set_dir / "queries.csv", encoding="utf-8")):
            queries.setdefault(r["query"], set()).add(r["filename"])
    return emb, labels, taken, hashes, queries, len(labels) / secs


def render(name: str, template: str, r: dict, speed: float, provenance: str) -> str:
    pct = lambda x: f"{100 * x:.1f}%"  # noqa: E731
    d = r["dups"]
    fl, n = r["missed_recall"]
    s_hit, s_n = r["search"]
    lines = [
        f"## {name} (template: {template}, {r['n']} photos)",
        "",
        f"Labels: {provenance}",
        "",
        "| metric | value |",
        "|---|---|",
        f"| Moment accuracy, descriptions only (all photos) | {pct(r['moment_acc_text'])} |",
        f"| Moment accuracy, descriptions only (held-out {r['held_out']}) | {pct(r['moment_acc_text_held'])} |",
        f"| Moment accuracy, with 1 example photo per moment ({r['examples']} moments, same held-out) | {pct(r['moment_acc_refs_held'])} |",
        f"| Missed-moment check: hidden moment flagged | {fl}/{n} |",
        f"| Missed-moment false alarms (moment present, flagged missed) | {', '.join(r['false_alarms']) or 'none'} |",
        f"| Template moments with no photos in set / flagged | {len(r['absent'])} / {len(r['absent_flagged'])} |",
        f"| Duplicate grouping, pairwise P / R / F1 | {pct(d['precision'])} / {pct(d['recall'])} / {pct(d['f1'])} ({d['true_pairs']} true pairs, {d['pred_pairs']} predicted) |",
        f"| Search top-{SEARCH_TOP} hit rate | {f'{s_hit}/{s_n}' if s_n else 'not measured (no queries.csv)'} |",
        "| Talking/scenery accuracy | not measured (no videos in set) |",
        "| Finals match accuracy | not measured (no finals in set) |",
        f"| Speed (preview + embed) | {speed:.1f} photos/s |",
        "",
    ]
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sets", nargs="+", type=Path)
    ap.add_argument("--template", default="birthday", choices=sorted(TEMPLATES))
    ap.add_argument("--out", type=Path, default=config.REPO_DIR / "results.md")
    a = ap.parse_args()

    clip_engine.load()
    device = clip_engine._model.device
    hw = f"{platform.platform()} · {platform.processor() or platform.machine()} · torch {torch.__version__} on {device}"
    parts = [
        "# Kuha evaluation results",
        "",
        f"Generated by `scripts/eval.py` on {datetime.now():%Y-%m-%d %H:%M}. Do not hand-edit.",
        f"Model: {config.CLIP_MODEL} / {config.CLIP_PRETRAINED}. Hardware: {hw}.",
        f"Thresholds: τ_score={config.TAU_SCORE}, τ_margin={config.TAU_MARGIN}, τ_cov={config.TAU_COV}, "
        f"α={config.ALPHA_WITH_REFS}, dup ≤{config.DUP_MAX_SECONDS}s & (pHash ≤{config.DUP_PHASH_MAX} or cos ≥{config.DUP_COS_MIN}).",
        "",
    ]
    for s in a.sets:
        emb, labels, taken, hashes, queries, speed = embed_set(s)
        r = score_set(emb, labels, taken, hashes, TEMPLATES[a.template], queries)
        notes = s / "NOTES.md"  # its title says where the labels came from (e.g. drafts, synthetic duplicates)
        provenance = notes.read_text(encoding="utf-8").splitlines()[0].lstrip("# ") if notes.exists() else "no NOTES.md"
        parts.append(render(s.name, a.template, r, speed, provenance))
    a.out.write_text("\n".join(parts), encoding="utf-8")
    print(a.out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    main()
