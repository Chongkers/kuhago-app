"""A preset is a starting point: moments are added, changed and removed, and every change re-labels the event.
Also the must-have rule of the missed-moment check, the off-theme gate, thumbnails and the folder window."""
import sys

import numpy as np
import pytest
import torch
from fastapi.testclient import TestClient
from PIL import Image

from app import config, db
from app.routes import dialog, owl
from ml import classifier, clip_engine, coverage
from ml.classifier import ShotItem
from test_ingest_search import _event, _ingest, e, fakes  # noqa: F401  (fakes is autouse)


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)  # no `with`: lifespan (CLIP load) never runs


@pytest.fixture
def event(client, tmp_path):
    """Cake (axis 0) and Group Photo (axis 2), with one red (axis 0) and one green (axis 2) photo."""
    folder = tmp_path / "phone"
    folder.mkdir()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(folder / "red.jpg")
    Image.new("RGB", (8, 8), (0, 255, 0)).save(folder / "green.jpg")
    ev = _event()
    _ingest(client, ev, [folder])
    return ev


def labels(client, ev):
    return {m["path"].rsplit("\\", 1)[-1].rsplit("/", 1)[-1]: m["moment"] for m in client.get(f"/events/{ev}/media").json()}


def test_add_rename_and_remove_a_moment_relabels(client, event):
    assert labels(client, event) == {"red.jpg": "Cake", "green.jpg": "Group Photo"}
    items = client.get(f"/events/{event}/shot_items").json()
    cake, group = items

    assert client.delete(f"/shot_items/{group['id']}").json() == [cake]
    assert labels(client, event)["green.jpg"] == config.UNSORTED

    res = client.post(f"/events/{event}/shot_items", json={"moment": "  Band on Stage ", "prompts": ["axis:2"], "required": False})
    assert res.status_code == 200
    band = res.json()
    assert (band["moment"], band["prompt"], band["required"], band["refs"]) == ("Band on Stage", ["axis:2"], False, [])
    assert labels(client, event)["green.jpg"] == "Band on Stage"

    renamed = client.patch(f"/shot_items/{band['id']}", json={"moment": "The Band", "required": True}).json()
    assert (renamed["moment"], renamed["required"], renamed["prompt"]) == ("The Band", True, ["axis:2"])
    assert labels(client, event)["green.jpg"] == "The Band"

    client.patch(f"/shot_items/{band['id']}", json={"prompts": ["axis:0"]})  # now it competes with Cake for red
    assert labels(client, event) == {"red.jpg": config.UNSORTED, "green.jpg": config.UNSORTED}


def test_moment_names_are_checked(client, event):
    cake = client.get(f"/events/{event}/shot_items").json()[0]
    dup = client.post(f"/events/{event}/shot_items", json={"moment": "cake"})
    assert dup.status_code == 409 and dup.json()["detail"] == "There's already a moment called cake."
    assert client.post(f"/events/{event}/shot_items", json={"moment": "unsorted"}).status_code == 409
    assert client.post(f"/events/{event}/shot_items", json={"moment": "   "}).status_code == 422
    assert client.patch(f"/shot_items/{cake['id']}", json={"moment": "Group Photo"}).status_code == 409
    assert client.patch(f"/shot_items/{cake['id']}", json={"moment": "CAKE"}).status_code == 200  # its own name
    assert client.patch(f"/shot_items/{cake['id']}", json={"prompts": []}).status_code == 422
    assert client.post("/events/999/shot_items", json={"moment": "x"}).status_code == 404
    assert client.patch("/shot_items/999", json={"required": False}).status_code == 404
    assert client.delete("/shot_items/999").status_code == 404


def test_blank_preset_empties_the_list_and_relabels(client, event):
    for blank in ("custom", "  "):
        assert client.post(f"/events/{event}/template", json={"event_type": blank}).json() == []
        assert set(labels(client, event).values()) == {config.UNSORTED}
        with db.connect() as con:
            assert con.execute("SELECT event_type FROM events").fetchone()[0] == "custom"
    assert client.get(f"/events/{event}/coverage").json() == []


def test_new_moment_without_prompts_asks_the_owl_or_uses_its_name(client, event, monkeypatch):
    known = lambda t: e(int(t.split(":")[1])) if t.startswith("axis:") else e(7)  # typed names land on axis 7
    monkeypatch.setattr(classifier, "embed_texts", lambda texts: np.stack([known(t) for t in texts]))
    plain = client.post(f"/events/{event}/shot_items", json={"moment": "Band on Stage"}).json()
    assert plain["prompt"] == ["a photo of band on stage"]  # no model: no Ollama call at all

    sent = {}

    def fake(path, body=None, **kw):
        sent.update(path=path, body=body, timeout=kw.get("timeout"))
        return {"message": {"content": 'Sure! {"prompts": ["a singer with a microphone", " ", "a crowd with raised hands", 7]}'}}

    monkeypatch.setattr(owl, "_ollama", fake)
    told = client.post(f"/events/{event}/shot_items", json={"moment": "Encore", "model": "gemma3:4b"}).json()
    assert told["prompt"] == ["a singer with a microphone", "a crowd with raised hands"]
    assert sent["body"]["model"] == "gemma3:4b" and sent["body"]["format"] == "json"
    assert sent["timeout"] == config.OLLAMA_PROMPT_TIMEOUT
    assert "Moment: Encore" in sent["body"]["messages"][1]["content"]

    def offline(*_a, **_kw):
        raise OSError("connection refused")

    monkeypatch.setattr(owl, "_ollama", offline)  # the owl being off never blocks adding a moment
    assert client.post(f"/events/{event}/shot_items", json={"moment": "Finale", "model": "gemma3:4b"}).json()["prompt"] == ["a photo of finale"]


def test_only_must_haves_are_missed_and_listed_first():
    items = [ShotItem("Games", ["axis:1"], required=False), ShotItem("Cake", ["axis:0"]), ShotItem("Group Photo", ["axis:2"])]
    out = coverage.compute_coverage(np.stack([e(0)]), items, [10], ["Cake"])
    assert [(c["moment"], c["required"], c["covered"]) for c in out] == [
        ("Group Photo", True, False), ("Games", False, False), ("Cake", True, True)
    ]


def test_off_theme_photos_stay_unsorted_and_cover_nothing(monkeypatch):
    """Concert photos in a Birthday event: a moment only wins a photo it fits better than "a photo" does."""
    monkeypatch.setattr(config, "BACKGROUND_PROMPTS", ["axis:9"])
    monkeypatch.setattr(classifier, "embed_texts", lambda texts: np.stack([e(int(t.split(":")[1])) for t in texts]))
    monkeypatch.setattr(config, "TAU_COV", 0.2)
    items = [ShotItem("Cake", ["axis:0"]), ShotItem("Games", ["axis:1"])]
    on_theme = (0.8 * e(0) + 0.6 * e(9)).astype(np.float32)   # cake 0.8 beats "a photo" 0.6
    off_theme = (0.6 * e(0) + 0.8 * e(9)).astype(np.float32)  # cake 0.6 loses to "a photo" 0.8
    assert [m for m, _ in classifier.classify_moments(np.stack([on_theme, off_theme]), items)] == ["Cake", config.UNSORTED]

    cake = coverage.compute_coverage(off_theme[None], items, [1], [config.UNSORTED])[0]
    assert (cake["moment"], cake["covered"], cake["best_score"]) == ("Cake", False, pytest.approx(0.6))
    assert coverage.compute_coverage(on_theme[None], items, [1], [config.UNSORTED])[-1]["covered"]

    monkeypatch.setattr(config, "TAU_BACKGROUND", -0.3)  # a looser gate lets it through again
    assert classifier.classify_moments(off_theme[None], items)[0][0] == "Cake"


class CountingClip:
    """Each text gets its own direction; counts how many texts the model was asked to encode."""

    def __init__(self):
        self.encoded = 0

    def tokenize(self, texts):
        return torch.tensor([[float(len(t))] for t in texts])

    def encode_text(self, t):
        self.encoded += len(t)
        return torch.nn.functional.one_hot(t[:, 0].long(), config.EMB_DIM).float() * 3


def test_text_embeddings_are_encoded_once(monkeypatch):
    model = CountingClip()
    monkeypatch.setattr(clip_engine, "_model", model)
    first = clip_engine.embed_texts(["a", "bbb", "a"])
    assert first.shape == (3, config.EMB_DIM) and model.encoded == 2
    np.testing.assert_array_equal(first[0], first[2])
    np.testing.assert_array_equal(clip_engine.embed_texts(["bbb", "cc"])[0], first[1])
    assert model.encoded == 3  # only "cc" was new
    assert clip_engine.embed_texts([]).shape == (0, config.EMB_DIM)

    other = CountingClip()
    monkeypatch.setattr(clip_engine, "_model", other)  # another model: nothing cached carries over
    clip_engine.embed_texts(["a"])
    assert other.encoded == 1


def test_thumb_is_small_cached_and_kept(client, event):
    media = client.get(f"/events/{event}/media").json()[0]
    with db.connect() as con:
        preview = con.execute("SELECT preview_path FROM media WHERE id = ?", (media["id"],)).fetchone()[0]
    Image.new("RGB", (1024, 512), (255, 0, 0)).save(preview)  # a real-sized preview
    res = client.get(f"/media/{media['id']}/thumb?v=abc")
    assert res.status_code == 200 and res.headers["content-type"] == "image/jpeg"
    assert "immutable" in res.headers["cache-control"]
    kept = list((config.event_dir(event) / "thumbs").glob("*.jpg"))
    assert len(kept) == 1
    with Image.open(kept[0]) as img:
        assert img.size == (config.THUMB_MAX_PX, config.THUMB_MAX_PX // 2)
    assert client.get(f"/media/{media['id']}/thumb").content == res.content
    assert client.get("/media/999/thumb").status_code == 404


def test_owl_suggests_moments_from_what_clip_sees(client, event, monkeypatch):
    monkeypatch.setattr(config, "SCENE_TAGS", ["axis:0", "axis:2", "axis:5"])
    monkeypatch.setattr(clip_engine, "embed_texts", lambda texts: np.stack([e(int(t.split(":")[1])) for t in texts]))
    calls = []

    def fake(path, body=None, **_):
        calls.append((path, body))
        if path == "/api/show":
            return {"capabilities": ["completion", "vision"]}
        return {"message": {"content": """{"moments": [
            {"moment": "Band on Stage", "prompts": ["a band playing on a stage", "a guitarist under stage lights"]},
            {"moment": "cake", "prompts": ["a cake"]},
            {"moment": "No Captions", "prompts": []},
            {"moment": "Crowd", "prompts": ["a crowd at a concert"]},
            "junk"]}"""}}

    monkeypatch.setattr(owl, "_ollama", fake)
    res = client.post(f"/events/{event}/suggest_moments", json={"model": "llava:7b"})
    assert res.status_code == 200, res.text
    assert res.json() == {
        "moments": [
            {"moment": "Band on Stage", "prompts": ["a band playing on a stage", "a guitarist under stage lights"]},
            {"moment": "Crowd", "prompts": ["a crowd at a concert"]},  # "cake" is already on the list
        ],
        "saw_photos": True,
    }
    path, body = calls[-1]
    system, user = body["messages"]
    assert path == "/api/chat" and body["model"] == "llava:7b" and body["format"] == "json"
    assert len(user["images"]) == 2  # a model that can see gets the photos
    for fact in ["Lola 80th", "Cake, Group Photo", "- axis:0 (1)", "- axis:2 (1)"]:
        assert fact in user["content"]
    assert client.get(f"/events/{event}/shot_items").json()[0]["moment"] == "Cake"  # nothing was saved
    assert len(client.get(f"/events/{event}/shot_items").json()) == 2

    def text_only(path, body=None, **_):
        calls.append((path, body))
        if path == "/api/show":
            return {"capabilities": ["completion"]}
        return {"message": {"content": "I can't help with that."}}

    monkeypatch.setattr(owl, "_ollama", text_only)
    res = client.post(f"/events/{event}/suggest_moments", json={})
    assert res.status_code == 502 and "any new moments" in res.json()["detail"]
    assert "images" not in calls[-1][1]["messages"][1]  # a text model gets the tags alone
    assert calls[-1][1]["model"] == config.OLLAMA_MODEL

    assert client.post("/events/999/suggest_moments", json={}).status_code == 404
    assert client.post(f"/events/{_event()}/suggest_moments", json={}).status_code == 400  # no photos yet


def test_folder_window_helper_stays_warm(client, monkeypatch):
    # stands in for the Tk helper: answers each request with a path, then with nothing (cancelled)
    fake = "import sys\nprint('ready', flush=True)\nfor n, _ in enumerate(sys.stdin):\n    print('' if n else 'D:/Photos/Lola 80th', flush=True)\n"
    monkeypatch.setattr(dialog, "_HELPER", fake)
    monkeypatch.setattr(dialog, "_proc", None)
    try:
        assert client.post("/pick-folder").json() == {"path": "D:/Photos/Lola 80th"}
        helper = dialog._proc
        assert client.post("/pick-folder").json() == {"path": None}
        assert dialog._proc is helper and helper.poll() is None  # one long-lived process, not one per click
    finally:
        dialog.close()

    monkeypatch.setattr(dialog, "_HELPER", "raise SystemExit(1)")  # no Tk on this machine
    res = client.post("/pick-folder")
    assert res.status_code == 503 and "Type the folder path" in res.json()["detail"]
    assert sys.executable  # the helper runs under the engine's own Python
