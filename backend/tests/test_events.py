import pytest
from fastapi.testclient import TestClient

from app import config


@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "kuha.sqlite3")


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)  # no `with`: lifespan (CLIP load) never runs


def test_create_then_list(client):
    res = client.post("/events", json={"mode": "personal", "name": "Lola 80th", "event_type": "birthday"})
    assert res.status_code == 200
    ev = res.json()
    assert ev == {
        "id": ev["id"], "mode": "personal", "name": "Lola 80th", "event_type": "birthday",
        "date": None, "venue": None, "client": None, "fee": None, "paid": None, "status": None,
    }
    assert client.get("/events").json() == [ev]


def test_create_rejects_bad_mode(client):
    assert client.post("/events", json={"mode": "boss", "name": "x", "event_type": "birthday"}).status_code == 422
    assert client.post("/events", json={"mode": "personal", "name": "x"}).status_code == 422  # event_type required


def test_patch_updates_only_given_fields(client):
    ev = client.post("/events", json={"mode": "pro", "name": "Debut", "event_type": "debut", "venue": "Hall"}).json()
    res = client.patch(f"/events/{ev['id']}", json={"status": "booked", "paid": True, "fee": 15000})
    assert res.status_code == 200
    out = res.json()
    assert (out["status"], out["paid"], out["fee"], out["venue"], out["name"]) == ("booked", True, 15000, "Hall", "Debut")
    assert client.get("/events").json() == [out]


def test_patch_rejects_bad_status_and_missing_event(client):
    ev = client.post("/events", json={"mode": "pro", "name": "Debut", "event_type": "debut"}).json()
    assert client.patch(f"/events/{ev['id']}", json={"status": "lost"}).status_code == 422
    assert client.patch(f"/events/{ev['id']}", json={"name": None}).status_code == 422
    assert client.patch("/events/999", json={"name": "x"}).status_code == 404


def test_list_shot_items(client):
    ev = client.post("/events", json={"mode": "personal", "name": "Lola 80th", "event_type": "birthday"}).json()
    applied = client.post(f"/events/{ev['id']}/template", json={"event_type": "birthday"}).json()
    assert client.get(f"/events/{ev['id']}/shot_items").json() == applied
    assert client.get("/events/999/shot_items").status_code == 404
