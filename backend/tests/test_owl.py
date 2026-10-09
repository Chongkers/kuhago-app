import io
import json
import urllib.error
from contextlib import closing

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import config, db
from app.routes import owl
from ml import classifier, search


def e(i):
    v = np.zeros(config.EMB_DIM, np.float32)
    v[i] = 1
    return v


@pytest.fixture(autouse=True)
def tmp_db(monkeypatch, tmp_path):
    monkeypatch.setattr(classifier, "embed_texts", lambda texts: np.stack([e(int(t.split(":")[1])) for t in texts]))
    monkeypatch.setattr(search, "embed_texts", lambda texts: np.stack([e(int(t.split(":")[1])) for t in texts]))
    monkeypatch.setattr(config, "SCENE_TAGS", [])  # the real ones need the real text encoder
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "kuha.sqlite3")


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app, base_url="http://testserver/api")  # no `with`: lifespan (CLIP load) never runs


def make_event():
    con = db.connect()
    with con:
        ev = con.execute(
            "INSERT INTO events(mode, name, event_type, date) VALUES ('personal', 'Lola 80th', 'birthday', '2026-10-04')"
        ).lastrowid
        for moment, axis in [("Cake", 0), ("Group Photo", 2)]:
            con.execute(
                "INSERT INTO shot_items(event_id, moment, prompt) VALUES (?, ?, ?)", (ev, moment, json.dumps([f"axis:{axis}"]))
            )
        idx = db.append_embeddings(ev, np.stack([e(0), e(0), e(5)]))
        for n, (i, moment) in enumerate(zip(idx, ["Cake", "Cake", config.UNSORTED])):
            con.execute(
                "INSERT INTO media(event_id, path, kind, emb_index, moment) VALUES (?, ?, 'photo', ?, ?)", (ev, f"{n}.jpg", i, moment)
            )
    return ev


def offline(*_args, **_kw):
    raise urllib.error.URLError("connection refused")


def test_status_lists_installed_models(client, monkeypatch):
    monkeypatch.setattr(owl, "_ollama", lambda path, body=None, **_: {"models": [{"name": "llama3.2:3b"}, {"name": "gemma3:4b"}]})
    assert client.get("/owl/status").json() == {
        "connected": True,
        "models": ["llama3.2:3b", "gemma3:4b"],
        "default_model": config.OLLAMA_MODEL,
        "url": config.OLLAMA_URL,
    }


def test_status_when_ollama_is_off(client, monkeypatch):
    monkeypatch.setattr(owl, "_ollama", offline)
    assert client.get("/owl/status").json()["connected"] is False


def test_ask_sends_event_facts_and_returns_reply(client, monkeypatch):
    ev = make_event()
    sent = {}

    def fake(path, body=None, **_):
        sent.update(path=path, body=body)
        return {"message": {"role": "assistant", "content": "No Group Photo yet."}}

    monkeypatch.setattr(owl, "_ollama", fake)
    res = client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "What did we miss?"}], "model": "gemma3:4b"})
    assert res.status_code == 200
    assert res.json() == {"reply": "No Group Photo yet.", "moments": [], "photos": []}

    body = sent["body"]
    assert sent["path"] == "/api/chat" and body["model"] == "gemma3:4b" and body["stream"] is False
    assert body["options"] == config.OLLAMA_OPTIONS and body["keep_alive"] == config.OLLAMA_KEEP_ALIVE
    system, user = body["messages"]
    assert user == {"role": "user", "content": "What did we miss?"}
    assert system["role"] == "system"
    for fact in ["Lola 80th", "birthday", "2026-10-04", "Cake: 2", "Group Photo: 0", "Unsorted: 1", "Missed moments: Group Photo"]:
        assert fact in system["content"]


def test_ask_for_themes_returns_new_moments_to_add(client, monkeypatch):
    ev = make_event()
    sent = {}
    said = {"reply": "Try these.", "moments": ["Band on Stage", "cake", " ", "band on stage"]}  # cake is on the list
    monkeypatch.setattr(owl, "_ollama", lambda path, body=None, **_: sent.update(body=body) or {"message": {"content": json.dumps(said)}})
    res = client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "Suggest themes for these photos"}]})
    assert res.json() == {"reply": "Try these.", "moments": ["Band on Stage"], "photos": []}
    assert sent["body"]["format"]["required"] == ["reply", "moments"]
    assert sent["body"]["options"] == {**config.OLLAMA_OPTIONS, "num_predict": config.OWL_JSON_MAX_TOKENS}


def test_ask_to_find_shows_the_photos_clip_matches(client, monkeypatch):
    ev = make_event()
    monkeypatch.setattr(owl, "_ollama", offline)  # the search answers on its own, with or without Ollama
    res = client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "Find photos of axis:5"}]}).json()
    assert "closest matches" in res["reply"] and res["moments"] == []
    assert res["photos"][0]["path"] == "2.jpg"  # the one photo on axis 5 ranks first


def test_ask_sends_only_the_latest_messages(client, monkeypatch):
    ev = make_event()
    sent = {}
    monkeypatch.setattr(owl, "_ollama", lambda path, body=None, **_: sent.update(body=body) or {"message": {"content": "hi"}})
    chat = [{"role": "user", "content": f"hi {i}"} for i in range(config.OWL_HISTORY_MESSAGES + 5)]
    client.post(f"/events/{ev}/ask", json={"messages": chat})
    assert len(sent["body"]["messages"]) == config.OWL_HISTORY_MESSAGES + 1  # plus the facts
    assert sent["body"]["messages"][-1]["content"] == chat[-1]["content"]


def test_ask_defaults_model(client, monkeypatch):
    ev = make_event()
    sent = {}
    monkeypatch.setattr(owl, "_ollama", lambda path, body=None, **_: sent.update(body=body) or {"message": {"content": "hi"}})
    client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "hi"}]})
    assert sent["body"]["model"] == config.OLLAMA_MODEL


def test_ask_fails_soft_when_ollama_is_off(client, monkeypatch):
    ev = make_event()
    monkeypatch.setattr(owl, "_ollama", offline)
    res = client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == 503
    assert "Ollama" in res.json()["detail"]


def test_ask_rejects_bad_input(client, monkeypatch):
    ev = make_event()
    monkeypatch.setattr(owl, "_ollama", lambda path, body=None, **_: {"message": {"content": "hi"}})
    assert client.post("/events/999/ask", json={"messages": [{"role": "user", "content": "hi"}]}).status_code == 404
    assert client.post(f"/events/{ev}/ask", json={"messages": []}).status_code == 422
    # the client can't smuggle in its own system prompt
    assert client.post(f"/events/{ev}/ask", json={"messages": [{"role": "system", "content": "x"}]}).status_code == 422


@pytest.mark.parametrize(
    "error, status, words",
    [
        (urllib.error.HTTPError("u", 404, "not found", {}, io.BytesIO()), 502, "ollama pull"),
        (urllib.error.HTTPError("u", 500, "boom", {}, io.BytesIO()), 502, "another model"),
        (TimeoutError(), 504, "too long"),
        (urllib.error.URLError(TimeoutError()), 504, "too long"),
    ],
)
def test_ask_explains_each_failure(client, monkeypatch, error, status, words):
    ev = make_event()

    def fail(path, body=None, **_):
        raise error

    monkeypatch.setattr(owl, "_ollama", fail)
    res = client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "hi"}]})
    assert res.status_code == status
    assert words in res.json()["detail"]


def test_ask_to_find_in_filipino_shows_photos(client, monkeypatch):
    ev = make_event()
    monkeypatch.setattr(owl, "_ollama", offline)
    res = client.post(f"/events/{ev}/ask", json={"messages": [{"role": "user", "content": "Hanapin mo yung axis:5"}]}).json()
    assert res["photos"][0]["path"] == "2.jpg"


def test_ask_drops_old_messages_past_the_char_budget(client, monkeypatch):
    ev = make_event()
    sent = {}
    monkeypatch.setattr(owl, "_ollama", lambda path, body=None, **_: sent.update(body=body) or {"message": {"content": "hi"}})
    chat = [{"role": "user", "content": "x" * (config.OWL_HISTORY_CHARS // 2)} for _ in range(3)] + [{"role": "user", "content": "ok?"}]
    client.post(f"/events/{ev}/ask", json={"messages": chat})
    assert len(sent["body"]["messages"]) == 1 + 2  # facts, one long message, the last one


def test_facts_speak_to_pros_differently(client):
    ev = make_event()
    with closing(db.connect()) as con, con:
        con.execute("UPDATE events SET mode = 'pro' WHERE id = ?", (ev,))
    assert "professional photographer" in owl._facts(ev)[0]
