"""Ingest job → SSE → media rows → preview → search, end to end over HTTP with a fake CLIP."""
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pathlib import Path

from PIL import Image

from app import config, db
from ml import classifier, clip_engine, search


def e(i):
    v = np.zeros(config.EMB_DIM, np.float32)
    v[i] = 1
    return v


def fake_embed_images(paths):
    """Mostly-red image -> axis 0, mostly-green -> axis 2."""
    rows = []
    for p in paths:
        with Image.open(p) as img:
            r, g, _ = img.convert("RGB").getpixel((0, 0))
        rows.append(e(0) if r > g else e(2))
    return list(paths), np.stack(rows) if rows else np.zeros((0, config.EMB_DIM), np.float32)


def fake_embed_texts(texts):
    return np.stack([e(int(t.split(":")[1])) for t in texts])


@pytest.fixture(autouse=True)
def fakes(monkeypatch, tmp_path):
    monkeypatch.setattr(clip_engine, "embed_images", fake_embed_images)
    monkeypatch.setattr(classifier, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(search, "embed_texts", fake_embed_texts)
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "data" / "kuha.sqlite3")


def test_top_k_sorted_by_cosine():
    emb = np.stack([e(1), 0.6 * e(0) + 0.8 * e(1), e(0), 0.8 * e(0) + 0.6 * e(1)])
    hits = search.top_k(emb, "axis:0", k=3)
    assert [i for i, _ in hits] == [2, 3, 1]
    assert hits[0][1] == pytest.approx(1.0)
    assert search.top_k(np.zeros((0, config.EMB_DIM), np.float32), "axis:0") == []


def _event():
    with db.connect() as con:
        ev = con.execute("INSERT INTO events(mode, name) VALUES ('personal', 'Lola 80th')").lastrowid
        for moment, axis in [("Cake", 0), ("Group Photo", 2)]:
            con.execute("INSERT INTO shot_items(event_id, moment, prompt) VALUES (?, ?, ?)", (ev, moment, json.dumps([f"axis:{axis}"])))
    return ev


def _ingest(client, ev, folders):
    res = client.post(f"/events/{ev}/ingest", json={"folders": [str(f) for f in folders]})
    assert res.status_code == 200, res.text
    with client.stream("GET", f"/jobs/{res.json()['job_id']}/events") as stream:
        return [json.loads(line[5:]) for line in stream.iter_lines() if line.startswith("data:")]


def test_ingest_two_folders_skips_bad_files_then_search(tmp_path):
    a, b = tmp_path / "phone_mom", tmp_path / "phone_tito"
    (a / "sub").mkdir(parents=True)
    b.mkdir()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(a / "cake.jpg")
    Image.new("RGB", (8, 8), (0, 255, 0)).save(a / "sub" / "group.PNG")
    (a / "broken.jpg").write_bytes(b"not an image")
    (a / "notes.txt").write_text("skip me")
    Image.new("RGB", (8, 8), (250, 10, 0)).save(b / "cake2.jpg")
    ev = _event()

    from app.main import app

    client = TestClient(app)  # no `with`: lifespan (CLIP load) never runs
    progress = _ingest(client, ev, [a, b])
    assert progress[-1]["stage"] == "done"
    assert {"stage": "previews", "done": 4, "total": 4} in progress  # 4 image files seen, txt ignored

    media = client.get(f"/events/{ev}/media").json()
    assert sorted((Path(m["path"]).name, m["moment"]) for m in media) == [
        ("cake.jpg", "Cake"), ("cake2.jpg", "Cake"), ("group.PNG", "Group Photo")
    ]
    assert [m["moment"] for m in client.get(f"/events/{ev}/media", params={"moment": "Cake"}).json()] == ["Cake", "Cake"]
    assert client.get(f"/media/{media[0]['id']}/preview").headers["content-type"] == "image/jpeg"
    cakes = [m for m in media if m["moment"] == "Cake"]
    assert cakes[0]["dup_group"] == cakes[1]["dup_group"] == min(m["id"] for m in cakes)  # same look, seconds apart
    best = client.get(f"/events/{ev}/media", params={"highlights": True}).json()
    assert sorted(m["moment"] for m in best) == ["Cake", "Group Photo"]  # one per duplicate group

    # Re-ingesting the same folder adds nothing.
    assert _ingest(client, ev, [a])[-1]["stage"] == "done"
    assert len(client.get(f"/events/{ev}/media").json()) == 3

    hits = client.get("/search", params={"q": "axis:2", "event_id": ev}).json()
    assert hits[0]["moment"] == "Group Photo" and hits[0]["score"] == pytest.approx(1.0)
    assert len(client.get("/search", params={"q": "axis:0"}).json()) == 3  # global search


def test_ingest_rejects_bad_input(tmp_path):
    from app.main import app

    client = TestClient(app)
    assert client.post("/events/999/ingest", json={"folders": [str(tmp_path)]}).status_code == 404
    ev = _event()
    assert client.post(f"/events/{ev}/ingest", json={"folders": [str(tmp_path / "nope")]}).status_code == 400
    assert client.get("/jobs/nope/events").status_code == 404
    assert client.get("/media/999/preview").status_code == 404


def test_second_ingest_while_running_is_rejected(tmp_path):
    from app.main import app
    from app.routes import ingest

    ev = _event()
    ingest._running.add(ev)
    try:
        assert TestClient(app).post(f"/events/{ev}/ingest", json={"folders": [str(tmp_path)]}).status_code == 409
    finally:
        ingest._running.discard(ev)
