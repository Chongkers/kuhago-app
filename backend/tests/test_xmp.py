"""Pro XMP: sidecar naming, backup before writing, keyword-only edits, ratings; real ExifTool when installed."""
import shutil

import pytest
from fastapi.testclient import TestClient

from app import config, db
from media import xmp

needs_exiftool = pytest.mark.skipif(shutil.which("exiftool") is None, reason="ExifTool not on PATH")


@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "data" / "kuha.sqlite3")


def test_sidecar_names(tmp_path):
    raw = tmp_path / "IMG_0001.CR3"
    assert xmp.sidecar_path(raw, "lightroom").name == "IMG_0001.xmp"
    assert xmp.sidecar_path(raw, "darktable").name == "IMG_0001.CR3.xmp"


def test_missing_exiftool_is_reported(monkeypatch, tmp_path):
    def gone(*a, **k):
        raise FileNotFoundError("exiftool")

    monkeypatch.setattr(xmp.subprocess, "run", gone)
    raw = tmp_path / "IMG_0001.CR3"
    raw.write_bytes(b"raw")
    with pytest.raises(xmp.ExifToolMissing):
        xmp.write_keywords([(raw, ["Cake"], [])], "darktable")


@needs_exiftool
def test_write_keywords_then_read_rating(tmp_path):
    raw, clip, bare = tmp_path / "IMG_0001.CR3", tmp_path / "toast.MOV", tmp_path / "IMG_0002.CR3"
    for f in (raw, clip, bare):
        f.write_bytes(b"original")
    # darktable already has a sidecar with an edit history and a 4-star rating
    old = xmp.sidecar_path(raw, "darktable")
    old.write_text(
        "<?xpacket begin='' id='W5M0MpCehiHzreSzNTczkc9d'?><x:xmpmeta xmlns:x='adobe:ns:meta/'>"
        "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>"
        "<rdf:Description rdf:about='' xmlns:xmp='http://ns.adobe.com/xap/1.0/'"
        " xmlns:darktable='http://darktable.sf.net/' xmp:Rating='4' darktable:history_end='3'/>"
        "</rdf:RDF></x:xmpmeta><?xpacket end='w'?>",
        encoding="utf-8",
    )
    before = old.read_text(encoding="utf-8")
    items = [
        (raw, ["18 Roses"], ["Kuha|Debut|18 Roses"]),
        (clip, ["Speech / Toast", "A-roll"], ["Kuha|Debut|Speech / Toast"]),
        (bare, [], []),  # Unsorted: nothing to say, no sidecar
    ]
    assert xmp.write_keywords(items, "darktable") == 2
    assert xmp.write_keywords(items, "darktable") == 2  # again: no duplicate keywords

    assert (tmp_path / config.XMP_BACKUP_DIR / old.name).read_text(encoding="utf-8") == before
    text = old.read_text(encoding="utf-8")
    assert "history_end" in text and text.count("18 Roses</rdf:li>") == 2  # dc:subject + the hierarchy, once each
    assert "Kuha|Debut|18 Roses" in text
    assert "A-roll" in xmp.sidecar_path(clip, "darktable").read_text(encoding="utf-8")
    assert not xmp.sidecar_path(bare, "darktable").exists()
    assert {f.read_bytes() for f in (raw, clip, bare)} == {b"original"}  # originals untouched
    assert not list(tmp_path.glob("*_original"))

    assert xmp.read_ratings([raw, clip, bare, tmp_path / "gone.CR3"]) == {raw: 4}


def test_route_builds_keywords_per_media(tmp_path, monkeypatch):
    from app.main import app
    from app.routes import xmp as route

    seen = {}

    def fake_write(items, mode):
        seen.update(mode=mode, items=[(p.name, flat, hier) for p, flat, hier in items])
        return len(items)

    monkeypatch.setattr(route, "write_keywords", fake_write)
    with db.connect() as con:
        ev = con.execute("INSERT INTO events(mode, name, event_type) VALUES ('pro', 'Bea', 'debut')").lastrowid
        for path, kind, moment, roll in [("a.CR3", "photo", "18 Roses", None), ("b.MOV", "video", "Unsorted", "B")]:
            con.execute(
                "INSERT INTO media(event_id, path, kind, moment, roll) VALUES (?, ?, ?, ?, ?)",
                (ev, str(tmp_path / path), kind, moment, roll),
            )
    client = TestClient(app, base_url="http://testserver/api")
    assert client.post(f"/events/{ev}/xmp", json={"mode": "lightroom"}).json() == {"written": 2}
    assert seen == {
        "mode": "lightroom",
        "items": [("a.CR3", ["18 Roses"], ["Kuha|Debut|18 Roses"]), ("b.MOV", ["B-roll"], [])],
    }
    assert client.post(f"/events/{ev}/xmp", json={"mode": "rapidraw"}).status_code == 422
    assert client.post("/events/999/xmp", json={"mode": "darktable"}).status_code == 404
