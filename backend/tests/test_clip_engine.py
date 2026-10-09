import numpy as np
import pytest
import torch
from PIL import Image

from app import config
from ml import clip_engine


class FakeClip:
    """Stands in for the real model: unnormalized random outputs, never loads weights."""

    def preprocess(self, img):
        return torch.zeros(3, 4, 4)

    def tokenize(self, texts):
        return torch.zeros(len(texts), 77)

    def encode_image(self, x):
        return torch.rand(len(x), config.EMB_DIM) * 7

    def encode_text(self, t):
        return torch.rand(len(t), config.EMB_DIM) * 7


@pytest.fixture(autouse=True)
def fake_model(monkeypatch):
    monkeypatch.setattr(clip_engine, "_model", FakeClip())
    monkeypatch.setattr(config, "BATCH_SIZE", 2)  # force several batches


def _jpgs(tmp_path, n):
    paths = []
    for i in range(n):
        p = tmp_path / f"{i}.jpg"
        Image.new("RGB", (8, 8), (i * 40, 0, 0)).save(p)
        paths.append(p)
    return paths


def _assert_unit_rows(emb, n):
    assert emb.shape == (n, config.EMB_DIM)
    assert emb.dtype == np.float32
    np.testing.assert_allclose(np.linalg.norm(emb, axis=1), 1.0, rtol=1e-5)


def test_embed_images_shape_and_unit_norm(tmp_path):
    paths = _jpgs(tmp_path, 5)
    ok, emb = clip_engine.embed_images(paths)
    assert ok == paths
    _assert_unit_rows(emb, 5)


def test_bad_file_is_skipped(tmp_path):
    good = _jpgs(tmp_path, 3)
    bad = tmp_path / "broken.jpg"
    bad.write_bytes(b"not an image")
    paths = [good[0], bad, good[1], tmp_path / "missing.jpg", good[2]]
    ok, emb = clip_engine.embed_images(paths)
    assert ok == good
    _assert_unit_rows(emb, 3)


def test_all_bad_returns_empty(tmp_path):
    ok, emb = clip_engine.embed_images([tmp_path / "missing.jpg"])
    assert ok == []
    assert emb.shape == (0, config.EMB_DIM)


def test_embed_texts_shape_and_unit_norm():
    _assert_unit_rows(clip_engine.embed_texts(["a cake", "a group photo", "a beach"]), 3)
