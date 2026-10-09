import numpy as np
import pytest

from app import config
from ml import classifier
from ml.classifier import ShotItem


def e(i, dim=config.EMB_DIM):
    v = np.zeros(dim, np.float32)
    v[i] = 1
    return v


def unit(v):
    return (v / np.linalg.norm(v)).astype(np.float32)


@pytest.fixture(autouse=True)
def fake_texts(monkeypatch):
    """Prompt "axis:N" embeds to the N-th basis vector, so tests control every cosine."""
    monkeypatch.setattr(
        classifier, "embed_texts", lambda texts: np.stack([e(int(t.split(":")[1])) for t in texts])
    )


ITEMS = [ShotItem("Cake", ["axis:0"]), ShotItem("Games", ["axis:1"]), ShotItem("Gifts", ["axis:2"])]


def test_argmax_and_margin():
    x = unit(np.array([0.5, 0.3, 0.1] + [0] * (config.EMB_DIM - 3)))
    [(moment, conf)] = classifier.classify_moments(x[None], ITEMS)
    assert moment == "Cake"
    assert conf == pytest.approx(x[0] - x[1])


def test_prompts_are_averaged():
    item = ShotItem("Cake", ["axis:0", "axis:1"])
    S = classifier.score_matrix(e(0)[None], [item])
    assert S[0, 0] == pytest.approx(1 / np.sqrt(2))


def test_low_top1_is_unsorted(monkeypatch):
    monkeypatch.setattr(config, "TAU_SCORE", 0.5)
    x = unit(np.array([0.4, 0.1, 0.0] + [0.9] + [0] * (config.EMB_DIM - 4)))
    [(moment, _)] = classifier.classify_moments(x[None], ITEMS)
    assert moment == config.UNSORTED


def test_small_margin_is_unsorted():
    x = unit(np.array([1.0, 1.0, 0.0] + [0] * (config.EMB_DIM - 3)))
    [(moment, conf)] = classifier.classify_moments(x[None], ITEMS)
    assert moment == config.UNSORTED
    assert conf == pytest.approx(0)


def test_examples_blend_with_alpha():
    # Text says axis 0, example photo says axis 3; a photo on axis 3 scores (1 - α).
    item = ShotItem("Cake", ["axis:0"], ref_emb=e(3)[None])
    S = classifier.score_matrix(np.stack([e(0), e(3)]), [item, ITEMS[1]])
    a = config.ALPHA_WITH_REFS
    assert S[0, 0] == pytest.approx(a)
    assert S[1, 0] == pytest.approx(1 - a)
    assert S[1, 1] == pytest.approx(0)  # no examples -> α = 1, text only


def test_examples_flip_the_label():
    x = unit(np.array([0.3, 0.4, 0, 0.9] + [0] * (config.EMB_DIM - 4)))
    assert classifier.classify_moments(x[None], ITEMS)[0][0] == "Games"
    with_ref = [ShotItem("Cake", ["axis:0"], ref_emb=e(3)[None]), *ITEMS[1:]]
    assert classifier.classify_moments(x[None], with_ref)[0][0] == "Cake"


def test_negative_scores_margin(monkeypatch):
    monkeypatch.setattr(config, "TAU_SCORE", -1)
    x = unit(np.array([-0.1, -0.5, -0.9] + [0] * (config.EMB_DIM - 3)))
    [(moment, conf)] = classifier.classify_moments(x[None], ITEMS)
    assert moment == "Cake"
    assert conf == pytest.approx(x[0] - x[1])


def test_single_moment_and_empty_inputs():
    [(moment, conf)] = classifier.classify_moments(e(0)[None], ITEMS[:1])
    assert moment == "Cake" and conf == pytest.approx(1)
    assert classifier.classify_moments(np.zeros((0, config.EMB_DIM), np.float32), ITEMS) == []
    assert classifier.classify_moments(e(0)[None], []) == [(config.UNSORTED, 0.0)]
