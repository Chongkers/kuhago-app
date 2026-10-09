"""Example photos: upload -> stored JPEG + embedding -> every photo is re-labelled."""
from io import BytesIO

from fastapi.testclient import TestClient
from PIL import Image

from app import config, db
from test_ingest_search import _event, _ingest, fakes  # noqa: F401  (fakes is autouse)


def _png(color) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (8, 8), color).save(buf, "PNG")
    return buf.getvalue()


def test_examples_relabel_the_event(tmp_path, monkeypatch):
    from app.main import app

    monkeypatch.setattr(config, "ALPHA_WITH_REFS", 0.0)  # examples decide alone, to make the flip exact
    folder = tmp_path / "phone"
    folder.mkdir()
    Image.new("RGB", (8, 8), (0, 255, 0)).save(folder / "green.jpg")  # text alone says "Group Photo"
    Image.new("RGB", (8, 8), (255, 0, 0)).save(folder / "red.jpg")
    client = TestClient(app, base_url="http://testserver/api")
    ev = _event()
    _ingest(client, ev, [folder])

    def moment_of(name):
        return next(m["moment"] for m in client.get(f"/events/{ev}/media").json() if m["path"].endswith(name))

    assert moment_of("green.jpg") == "Group Photo"

    cake = next(s for s in client.get(f"/events/{ev}/shot_items").json() if s["moment"] == "Cake")
    assert cake["refs"] == []
    files = [("files", ("a.png", _png((0, 255, 0)), "image/png")), ("files", ("notes.txt", b"not a photo", "text/plain"))]
    res = client.post(f"/shot_items/{cake['id']}/refs", files=files)
    assert res.status_code == 200 and res.json() == {"added": 1}  # the text file is skipped, not fatal

    # the family's "cake" example is green too: the green photo now fits both moments equally, so no guess
    assert moment_of("green.jpg") == config.UNSORTED
    refs = next(s for s in client.get(f"/events/{ev}/shot_items").json() if s["moment"] == "Cake")["refs"]
    assert len(refs) == 1
    assert client.get(f"/refs/{refs[0]}/image").headers["content-type"] == "image/jpeg"
    with db.connect() as con:
        assert len(db.load_embeddings(ev)) == 3  # two photos + one example share emb.npy
        assert con.execute("SELECT emb_index FROM refs").fetchone()["emb_index"] == 2

    assert client.post(f"/shot_items/{cake['id']}/refs", files=files[:1]).json() == {"added": 0}  # same photo again
    assert client.post("/shot_items/999/refs", files=files[:1]).status_code == 404
    assert client.get("/refs/999/image").status_code == 404
