import json

import pytest
from fastapi.testclient import TestClient

from app import config, db
from app.routes import events


@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "kuha.sqlite3")


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app, base_url="http://testserver/api")  # no `with`: lifespan (CLIP load) never runs


def _event():
    con = db.connect()
    with con:
        return con.execute("INSERT INTO events(mode, name) VALUES ('personal', 'Lola 80th')").lastrowid


# proto/clip_proto.py BIRTHDAY, keyed by the UI's moment labels
PROTO_BIRTHDAY = [
    ["people arriving at a party", "guests greeting each other at the door"],
    ["a person blowing out candles on a birthday cake", "a birthday cake with lit candles"],
    ["a birthday cake on a table", "a person cutting a cake"],
    ["a table full of food at a party", "people eating at a buffet"],
    ["children playing party games", "people playing a game at a party"],
    ["a person opening a gift", "wrapped presents and gift boxes"],
    ["a large group of people posing together for a photo", "a family posing for a group photo"],
    ["balloons and party decorations", "a banner and streamers at a birthday party"],
]


def test_birthday_matches_proto():
    assert [m["prompts"] for m in events.TEMPLATES["birthday"]["moments"]] == PROTO_BIRTHDAY


def test_all_eight_templates_are_well_formed():
    assert set(events.TEMPLATES) == {"birthday", "christmas", "graduation", "trip", "reunion", "debut", "wedding", "binyag"}
    for name, t in events.TEMPLATES.items():
        assert t["event_type"] == name
        for m in t["moments"]:
            assert m["moment"] and isinstance(m["required"], bool) and len(m["prompts"]) >= 1


def test_apply_template_inserts_shot_items(client):
    event_id = _event()
    res = client.post(f"/events/{event_id}/template", json={"event_type": "birthday"})
    assert res.status_code == 200
    items = res.json()
    assert [i["moment"] for i in items][:2] == ["Arrival / Guests", "Blowing the Candles"]
    assert items[1]["prompt"] == PROTO_BIRTHDAY[1]

    rows = db.connect().execute("SELECT moment, prompt FROM shot_items WHERE event_id = ?", (event_id,)).fetchall()
    assert len(rows) == 8 and json.loads(rows[0]["prompt"]) == PROTO_BIRTHDAY[0]
    assert db.connect().execute("SELECT event_type FROM events").fetchone()[0] == "birthday"


def test_reapplying_replaces_shot_items(client):
    event_id = _event()
    client.post(f"/events/{event_id}/template", json={"event_type": "birthday"})
    items = client.post(f"/events/{event_id}/template", json={"event_type": "graduation"}).json()
    count = db.connect().execute("SELECT COUNT(*) FROM shot_items").fetchone()[0]
    assert count == len(items) == 5


def test_unknown_template_or_event_is_404(client):
    event_id = _event()
    assert client.post(f"/events/{event_id}/template", json={"event_type": "../config"}).status_code == 404
    assert client.post("/events/999/template", json={"event_type": "birthday"}).status_code == 404
