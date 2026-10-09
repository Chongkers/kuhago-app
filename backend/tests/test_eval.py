import numpy as np

from app import config
from ml import classifier, search
from scripts import eval as ev


def e(i):
    v = np.zeros(config.EMB_DIM, np.float32)
    v[i] = 1
    return v


def fake_embed_texts(texts):
    return np.stack([e(int(t.split(":")[1])) for t in texts])


def test_pair_scores():
    assert ev.pair_scores(["a", "a", "", "b", "b"], [0, 0, None, None, 2]) == {
        "precision": 1.0, "recall": 0.5, "f1": 2 / 3, "true_pairs": 2, "pred_pairs": 1}


def test_score_set_on_synthetic_event(monkeypatch):
    monkeypatch.setattr(classifier, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(search, "embed_texts", fake_embed_texts)
    template = {"moments": [{"moment": m, "prompts": [f"axis:{i}"]} for i, m in enumerate(["Cake", "Group Photo", "Games"])]}
    rows = [("c1", "Cake", "a"), ("c1_b1", "Cake", "a"), ("c2", "Cake", ""), ("g1", "Group Photo", ""), ("g2", "Group Photo", "")]
    labels = [{"filename": f"{n}.jpg", "moment": m, "roll": "", "dup_group": d} for n, m, d in rows]
    emb = np.stack([e(0), e(0), e(0), e(1), e(1)])
    r = ev.score_set(emb, labels, [0, 2, 100, 300, 400], [None] * 5, template, {"axis:1": {"g2.jpg"}})

    assert r["moment_acc_text"] == 1.0
    assert (r["examples"], r["held_out"]) == (2, 2)  # c1 + its burst frame and g1 are examples/leaked
    assert r["moment_acc_refs_held"] == 1.0
    assert r["missed_recall"] == (2, 2) and r["false_alarms"] == []
    assert r["absent"] == r["absent_flagged"] == ["Games"]
    assert r["dups"]["f1"] == 1.0
    assert r["search"] == (1, 1)
