"""Pro finals: matcher rules, then scan-folder job -> matched / unmatched / not yet edited."""
import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config, db
from app.routes import finals
from ml.matcher import match_finals
from test_ingest_search import _event, _ingest, e, fakes  # noqa: F401  (fakes is autouse)


def test_matcher_prefers_phash_within_the_top_cosines(monkeypatch):
    monkeypatch.setattr(config, "FINALS_TOP_K", 2)
    monkeypatch.setattr(config, "FINALS_PHASH_MAX", 12)
    monkeypatch.setattr(config, "FINALS_COS_MIN", 0.92)
    selects = np.stack([e(0), 0.8 * e(0) + 0.6 * e(1), e(2)])
    hashes = [0b1111_1111_1111_1111, 0b0, 0b0]
    out = match_finals(np.stack([e(0), e(5), e(2)]), [0b1, None, 0xFFFF_FFFF_FFFF_FFFF], selects, hashes)
    assert out[0] == (1, pytest.approx(0.8))  # row 0 has the higher cosine, row 1 is the closer picture
    assert out[1][0] is None  # looks like nothing we shot
    assert out[2] == (2, pytest.approx(1.0))  # heavy edit broke the pHash, the cosine still accepts it
    assert match_finals(np.stack([e(0)]), [0], np.zeros((0, config.EMB_DIM), np.float32), []) == [(None, 0.0)]


def test_scan_finals_folder(tmp_path, monkeypatch):
    from app.main import app

    raws, exports = tmp_path / "card", tmp_path / "exports"
    raws.mkdir()
    exports.mkdir()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(raws / "red.jpg")
    Image.new("RGB", (8, 8), (0, 255, 0)).save(raws / "green.jpg")
    Image.new("RGB", (8, 8), (255, 0, 0)).save(exports / "Ana-001.jpg")  # the red select, renamed
    (exports / "broken.jpg").write_bytes(b"not an image")
    # the editor's sidecars say: both rated 4 stars
    monkeypatch.setattr(finals, "read_ratings", lambda srcs: {s: 4 for s in srcs})

    client = TestClient(app)
    ev = _event()
    _ingest(client, ev, [raws])
    media = {m["path"][-7:]: m["id"] for m in client.get(f"/events/{ev}/media").json()}
    assert client.get(f"/events/{ev}/finals").json() == {"matched": [], "unmatched_finals": [], "unedited_selects": []}

    res = client.post(f"/events/{ev}/finals", json={"folder": str(exports)})
    assert res.status_code == 200, res.text
    with client.stream("GET", f"/jobs/{res.json()['job_id']}/events") as stream:
        lines = [line for line in stream.iter_lines() if line.startswith("data:")]
    assert '"done"' in lines[-1] and not any('"error"' in line for line in lines)

    out = client.get(f"/events/{ev}/finals").json()
    assert [(m["final_path"][-11:], m["media_id"]) for m in out["matched"]] == [("Ana-001.jpg", media["red.jpg"])]
    assert out["unmatched_finals"] == []
    assert out["unedited_selects"] == [media["een.jpg"]]  # green.jpg: rated, no final yet
    with db.connect() as con:
        assert {r["rating"] for r in con.execute("SELECT rating FROM media")} == {4}

    assert client.post(f"/events/{ev}/finals", json={"folder": str(tmp_path / "nope")}).status_code == 400
    assert client.post("/events/999/finals", json={"folder": str(exports)}).status_code == 404
