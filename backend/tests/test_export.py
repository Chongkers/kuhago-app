"""Export: dry-run plan per layout, then a background copy job that never touches originals."""
import json
from contextlib import closing
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import config, db
from media.export import plan_export


@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "data" / "kuha.sqlite3")


def _file(path: Path, body: str = "x") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    return path


def _media(con, ev, path, kind="photo", moment="Cake", **cols):
    cols = {"event_id": ev, "path": str(path), "kind": kind, "moment": moment, **cols}
    con.execute(f"INSERT INTO media({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", list(cols.values()))


def _personal_event(src: Path) -> int:
    with closing(db.connect()) as con, con:
        ev = con.execute(
            "INSERT INTO events(mode, name, date) VALUES ('personal', 'Lola''s 80th: Party', '2026-10-09')"
        ).lastrowid
        _media(con, ev, _file(src / "mom" / "IMG_0001.jpg", "mom cake"), is_highlight=1)
        _media(con, ev, _file(src / "tito" / "IMG_0001.jpg", "tito cake"))  # same name, other phone
        _media(con, ev, _file(src / "mom" / "blurry.jpg"), moment="Unsorted")
        _media(con, ev, _file(src / "mom" / "speech.mp4"), kind="video", roll="A")
        _media(con, ev, _file(src / "mom" / "beach.mov"), kind="video", roll="B")
    return ev


def test_personal_layout(tmp_path):
    ev = _personal_event(tmp_path / "src")
    with closing(db.connect()) as con:
        plan = plan_export(con, ev)
    root = "2026-10-09_Lola's 80th - Party"
    assert plan["root"] == root
    assert [c["dest"] for c in plan["copies"]] == [
        f"{root}/Highlights/IMG_0001.jpg",
        f"{root}/Moments/Cake/IMG_0001.jpg",
        f"{root}/Moments/Cake/IMG_0001_2.jpg",  # never overwrite a same-named file from another phone
        f"{root}/Videos/Talking/speech.mp4",
        f"{root}/Videos/Scenery/beach.mov",
        f"{root}/Unsorted/blurry.jpg",
    ]


def test_pro_layout(tmp_path):
    src = tmp_path / "src"
    with closing(db.connect()) as con, con:
        ev = con.execute(
            "INSERT INTO events(mode, name, date, client) VALUES ('pro', 'Debut', '2026-10-09', 'Santos/Reyes')"
        ).lastrowid
        _media(con, ev, _file(src / "card" / "A.CR3"), moment="Cake", rating=4)
        _media(con, ev, _file(src / "card" / "B.CR3"), moment="18 Roses", rating=1)
        _media(con, ev, _file(src / "card" / "C.CR3"), moment="Unsorted")
        _media(con, ev, _file(src / "card" / "toast.mp4"), kind="video", roll="A")
        _media(con, ev, _file(src / "card" / "venue.mp4"), kind="video", roll="B")
        con.execute("INSERT INTO finals(event_id, path) VALUES (?, ?)", (ev, str(_file(src / "finals" / "A_edit.jpg"))))
        item = con.execute("INSERT INTO shot_items(event_id, moment, prompt) VALUES (?, 'Cake', '[]')", (ev,)).lastrowid
        con.execute("INSERT INTO refs(shot_item_id, image_path) VALUES (?, ?)", (item, str(_file(src / "ref.png"))))
    with closing(db.connect()) as con:
        plan = plan_export(con, ev)
    root = "2026-10-09_Santos - Reyes_Debut"
    assert [c["dest"] for c in plan["copies"]] == [
        f"{root}/01_RAW/Cake/A.CR3",
        f"{root}/01_RAW/18 Roses/B.CR3",
        f"{root}/01_RAW/Unsorted/C.CR3",
        f"{root}/02_SELECTS/A.CR3",
        f"{root}/03_FINALS/A_edit.jpg",
        f"{root}/04_VIDEO/A-ROLL/toast.mp4",
        f"{root}/04_VIDEO/B-ROLL/venue.mp4",
        f"{root}/05_REFERENCES/ref.png",
    ]


def _sse(client, job_id):
    with client.stream("GET", f"/jobs/{job_id}/events") as stream:
        return [json.loads(line[5:]) for line in stream.iter_lines() if line.startswith("data:")]


def test_dry_run_then_copy(tmp_path):
    from app.main import app

    client = TestClient(app, base_url="http://testserver/api")  # no `with`: lifespan (CLIP load) never runs
    src, out = tmp_path / "src", tmp_path / "out"
    ev = _personal_event(src)
    root = out / "2026-10-09_Lola's 80th - Party"
    _file(root / "Unsorted" / "blurry.jpg", "already here")  # a previous export: left alone
    (src / "mom" / "beach.mov").unlink()  # vanished since ingest: skipped, job goes on

    res = client.post(f"/events/{ev}/export", json={"dest": "", "dry_run": True})
    assert res.status_code == 200
    assert len(res.json()["copies"]) == 6
    assert not (root / "Highlights").exists()  # dry run writes nothing

    res = client.post(f"/events/{ev}/export", json={"dest": str(out), "dry_run": False})
    assert res.status_code == 200, res.text
    progress = _sse(client, res.json()["job_id"])
    assert progress[-1]["stage"] == "done"
    assert {"stage": "copying", "done": 6, "total": 6} in progress
    assert [p["message"] for p in progress if p["stage"] == "error"] == [
        "1 of 6 files could not be copied. The rest are in the folder."
    ]

    assert (root / "Moments" / "Cake" / "IMG_0001.jpg").read_text() == "mom cake"
    assert (root / "Moments" / "Cake" / "IMG_0001_2.jpg").read_text() == "tito cake"
    assert (root / "Highlights" / "IMG_0001.jpg").read_text() == "mom cake"
    assert (root / "Unsorted" / "blurry.jpg").read_text() == "already here"
    assert not (root / "Videos" / "Scenery" / "beach.mov").exists()
    assert (src / "mom" / "IMG_0001.jpg").read_text() == "mom cake"  # originals stay put


def test_export_rejects_bad_input(tmp_path):
    from app.main import app

    client = TestClient(app, base_url="http://testserver/api")
    assert client.post("/events/999/export", json={"dest": str(tmp_path), "dry_run": True}).status_code == 404
    ev = _personal_event(tmp_path / "src")
    assert client.post(f"/events/{ev}/export", json={"dest": "relative/dir", "dry_run": False}).status_code == 400
    assert client.post(f"/events/{ev}/export", json={"dest": "", "dry_run": False}).status_code == 400
    _file(tmp_path / "a_file")
    assert client.post(f"/events/{ev}/export", json={"dest": str(tmp_path / "a_file"), "dry_run": False}).status_code == 400
    typo = tmp_path / "no_such_parent" / "out"  # a mistyped path is refused, not silently created
    assert client.post(f"/events/{ev}/export", json={"dest": str(typo), "dry_run": False}).status_code == 400
    assert not typo.parent.exists()
