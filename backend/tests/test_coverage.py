import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config, db
from ml import classifier, coverage
from ml.classifier import ShotItem


def e(i):
    v = np.zeros(config.EMB_DIM, np.float32)
    v[i] = 1
    return v


@pytest.fixture(autouse=True)
def fake_texts(monkeypatch, tmp_path):
    """Prompt "axis:N" embeds to the N-th basis vector; DB lives in tmp_path."""
    monkeypatch.setattr(classifier, "embed_texts", lambda texts: np.stack([e(int(t.split(":")[1])) for t in texts]))
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "kuha.sqlite3")


ITEMS = [ShotItem("Cake", ["axis:0"]), ShotItem("Games", ["axis:1"]), ShotItem("Group Photo", ["axis:2"])]


def test_empty_moment_is_missed_and_listed_first():
    emb = np.stack([e(0), e(0), e(1)])
    out = coverage.compute_coverage(emb, ITEMS, [10, 11, 12], ["Cake", "Cake", "Games"])
    assert [c["moment"] for c in out] == ["Group Photo", "Cake", "Games"]
    missed = out[0]
    assert missed == {"moment": "Group Photo", "covered": False, "count": 0, "best_score": 0.0, "candidates": [10, 11, 12]}
    assert out[1]["covered"] and out[1]["count"] == 2


def test_one_strong_unassigned_hit_covers():
    # Classifier left it Unsorted, but its score clears TAU_COV -> not missed.
    emb = np.stack([e(3), e(2)])
    out = {c["moment"]: c for c in coverage.compute_coverage(emb, ITEMS, [7, 8], [config.UNSORTED] * 2)}
    assert out["Group Photo"] == {"moment": "Group Photo", "covered": True, "count": 0, "best_score": 1.0, "candidates": [8, 7]}
    assert not out["Cake"]["covered"] and not out["Games"]["covered"]


def test_candidates_are_top_by_score():
    emb = np.stack([e(1), 0.6 * e(0) + 0.8 * e(1), e(0), 0.8 * e(0) + 0.6 * e(1)])
    cake = next(c for c in coverage.compute_coverage(emb, ITEMS, [1, 2, 3, 4], ["x"] * 4) if c["moment"] == "Cake")
    assert cake["candidates"] == [3, 4, 2]
    assert cake["best_score"] == pytest.approx(1.0)


def test_no_media_everything_missed():
    out = coverage.compute_coverage(np.zeros((0, config.EMB_DIM), np.float32), ITEMS, [], [])
    assert [(c["covered"], c["best_score"], c["candidates"]) for c in out] == [(False, 0.0, [])] * 3


def test_coverage_route_reads_db_and_embeddings():
    con = db.connect()
    with con:
        ev = con.execute("INSERT INTO events(mode, name) VALUES ('personal', 'Lola 80th')").lastrowid
        for moment, axis in [("Cake", 0), ("Group Photo", 2)]:
            con.execute(
                "INSERT INTO shot_items(event_id, moment, prompt) VALUES (?, ?, ?)", (ev, moment, json.dumps([f"axis:{axis}"]))
            )
        [i] = db.append_embeddings(ev, e(0)[None])
        mid = con.execute(
            "INSERT INTO media(event_id, path, kind, emb_index, moment) VALUES (?, 'a.jpg', 'photo', ?, 'Cake')", (ev, i)
        ).lastrowid

    from app.main import app

    client = TestClient(app)  # no `with`: lifespan (CLIP load) never runs
    res = client.get(f"/events/{ev}/coverage")
    assert res.status_code == 200
    assert res.json() == [
        {"moment": "Group Photo", "covered": False, "count": 0, "best_score": 0.0, "candidates": [mid]},
        {"moment": "Cake", "covered": True, "count": 1, "best_score": 1.0, "candidates": [mid]},
    ]
    assert client.get("/events/999/coverage").status_code == 404
