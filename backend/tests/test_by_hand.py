"""What the user fixes by hand: delete an event, move a photo, mark a favorite, play a video, remove an example
photo, stop a running Organize. Also the health check and the notes about files that were left out."""
import sqlite3
import threading
from contextlib import closing
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import config, db, jobs
from app.routes import ingest, owl
from media.export import plan_export
from test_ingest_search import _event, _ingest, fakes  # noqa: F401  (fakes is autouse)


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app, base_url="http://testserver/api")  # no `with`: lifespan (CLIP load) never runs


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


def media(client, ev):
    return {m["path"].rsplit("\\", 1)[-1].rsplit("/", 1)[-1]: m for m in client.get(f"/events/{ev}/media").json()}


def test_delete_event_forgets_it_and_its_data_folder(client, event):
    folder = config.event_dir(event)
    assert (folder / "emb.npy").exists()
    ingest._running.add(event)
    try:
        assert client.delete(f"/events/{event}").status_code == 409  # still being organized
    finally:
        ingest._running.discard(event)
    assert client.delete(f"/events/{event}").json() == {"deleted": event}
    assert client.get("/events").json() == []
    assert client.get(f"/events/{event}/media").status_code == 404
    assert not folder.exists()
    assert client.delete(f"/events/{event}").status_code == 404
    with closing(db.connect()) as con:
        assert con.execute("SELECT count(*) FROM media").fetchone()[0] == 0  # rows cascade


def test_new_event_never_inherits_a_leftover_folder(client):
    leftover = config.event_dir(1) / "emb.npy"
    leftover.parent.mkdir(parents=True)
    leftover.write_bytes(b"stale")
    assert client.post("/events", json={"mode": "personal", "name": "Next", "event_type": "birthday"}).json()["id"] == 1
    assert not leftover.exists()


def test_health_names_missing_tools(client, monkeypatch):
    monkeypatch.setattr(config, "has_tool", lambda name: name == "exiftool")
    assert client.get("/health").json() == {
        "ready": True, "ffmpeg": False, "exiftool": True,
        "highlights_per_moment": config.HIGHLIGHTS_PER_MOMENT, "select_min_rating": config.SELECT_MIN_RATING,
    }


def test_moved_photo_stays_put_through_every_resort(client, event):
    red = media(client, event)["red.jpg"]
    assert (red["moment"], red["moment_locked"]) == ("Cake", False)

    moved = client.patch(f"/media/{red['id']}", json={"moment": " group photo "}).json()
    assert (moved["moment"], moved["moment_locked"]) == ("Group Photo", True)
    assert client.patch(f"/media/{red['id']}", json={"moment": "Nope"}).status_code == 422
    assert client.patch("/media/999", json={"moment": "Cake"}).status_code == 404

    # editing the list re-sorts everything else, not what was placed by hand
    client.post(f"/events/{event}/shot_items", json={"moment": "Reds", "prompts": ["axis:0"]})
    assert media(client, event)["red.jpg"]["moment"] == "Group Photo"

    group = next(s for s in client.get(f"/events/{event}/shot_items").json() if s["moment"] == "Group Photo")
    client.patch(f"/shot_items/{group['id']}", json={"moment": "Everyone"})  # it follows its moment's new name
    assert (media(client, event)["red.jpg"]["moment"], media(client, event)["red.jpg"]["moment_locked"]) == ("Everyone", True)

    client.patch(f"/media/{red['id']}", json={"moment": "Unsorted"})  # "this one fits nothing" is a choice too
    assert media(client, event)["red.jpg"]["moment"] == config.UNSORTED
    client.patch(f"/media/{red['id']}", json={"moment": "Everyone"})

    client.delete(f"/shot_items/{group['id']}")  # its moment is gone: KuhaGo decides again
    back = media(client, event)["red.jpg"]
    assert back["moment_locked"] is False and back["moment"] == config.UNSORTED  # Cake and Reds tie on red


def test_handing_a_photo_back_resorts_it(client, event):
    green = media(client, event)["green.jpg"]
    client.patch(f"/media/{green['id']}", json={"moment": "Cake"})
    assert media(client, event)["green.jpg"]["moment"] == "Cake"
    back = client.patch(f"/media/{green['id']}", json={"moment": None}).json()
    assert (back["moment"], back["moment_locked"]) == ("Group Photo", False)


def test_favorites_are_set_by_hand_and_exported(client, event):
    red = media(client, event)["red.jpg"]
    assert client.patch(f"/media/{red['id']}", json={"is_select": True}).json()["is_select"] is True
    assert media(client, event)["red.jpg"]["moment"] == "Cake"  # marking a favorite moves nothing
    assert client.patch(f"/media/{red['id']}", json={"is_select": None}).status_code == 422
    with closing(db.connect()) as con:
        dests = [c["dest"] for c in plan_export(con, event)["copies"]]
    assert [d.split("/", 1)[1] for d in dests if "/Favorites/" in d] == ["Favorites/red.jpg"]
    client.patch(f"/media/{red['id']}", json={"is_select": False})
    with closing(db.connect()) as con:
        assert not [c for c in plan_export(con, event)["copies"] if "/Favorites/" in c["dest"]]


def test_video_file_is_served_for_the_player(client, event, tmp_path):
    clip = tmp_path / "toast.MOV"
    clip.write_bytes(b"0123456789")
    with closing(db.connect()) as con, con:
        vid = con.execute("INSERT INTO media(event_id, path, kind) VALUES (?, ?, 'video')", (event, str(clip))).lastrowid
        gone = con.execute("INSERT INTO media(event_id, path, kind) VALUES (?, ?, 'video')", (event, str(tmp_path / "gone.mp4"))).lastrowid
    res = client.get(f"/media/{vid}/file")
    assert res.status_code == 200 and res.content == b"0123456789" and res.headers["content-type"] == "video/mp4"
    part = client.get(f"/media/{vid}/file", headers={"Range": "bytes=2-5"})  # seeking in the player
    assert part.status_code == 206 and part.content == b"2345"
    assert client.get(f"/media/{gone}/file").status_code == 404  # the drive was unplugged
    assert client.get(f"/media/{media(client, event)['red.jpg']['id']}/file").status_code == 404  # photos: preview only


def test_remove_an_example_photo(client, event, monkeypatch):
    monkeypatch.setattr(config, "ALPHA_WITH_REFS", 0.0)  # examples decide alone, to make the flip exact
    buf = BytesIO()
    Image.new("RGB", (8, 8), (0, 255, 0)).save(buf, "PNG")
    cake = next(s for s in client.get(f"/events/{event}/shot_items").json() if s["moment"] == "Cake")
    client.post(f"/shot_items/{cake['id']}/refs", files=[("files", ("a.png", buf.getvalue(), "image/png"))])
    assert media(client, event)["green.jpg"]["moment"] == config.UNSORTED  # a green "cake" example confuses it
    ref = next(s for s in client.get(f"/events/{event}/shot_items").json() if s["moment"] == "Cake")["refs"][0]
    stored = list((config.event_dir(event) / "refs").glob("*.jpg"))
    assert len(stored) == 1

    assert client.delete(f"/refs/{ref}").json() == {"removed": ref}
    assert media(client, event)["green.jpg"]["moment"] == "Group Photo"  # re-labelled without it
    assert not stored[0].exists()
    assert client.get(f"/events/{event}/shot_items").json()[0]["refs"] == []
    assert client.delete(f"/refs/{ref}").status_code == 404


def test_remove_example_never_deletes_a_file_outside_the_event(client, event, tmp_path):
    theirs = tmp_path / "their_photo.jpg"
    theirs.write_bytes(b"original")
    with closing(db.connect()) as con, con:
        item = con.execute("SELECT id FROM shot_items WHERE event_id = ?", (event,)).fetchone()["id"]
        ref = con.execute("INSERT INTO refs(shot_item_id, image_path) VALUES (?, ?)", (item, str(theirs))).lastrowid
    assert client.delete(f"/refs/{ref}").status_code == 200
    assert theirs.read_bytes() == b"original"


def test_stopping_organize_leaves_the_event_as_it_was(client, tmp_path, monkeypatch):
    real = ingest.make_preview

    def stop_during_first(src, out_dir):
        jobs._cancelled.update(jobs._jobs)  # the user pressed Stop while the first photo was being read
        return real(src, out_dir)

    monkeypatch.setattr(ingest, "make_preview", stop_during_first)
    folder = tmp_path / "phone"
    folder.mkdir()
    for name in ("a.jpg", "b.jpg"):
        Image.new("RGB", (8, 8), (255, 0, 0)).save(folder / name)
    ev = _event()
    progress = _ingest(client, ev, [folder])
    assert [p["stage"] for p in progress] == ["previews", "cancelled", "done"]
    assert client.get(f"/events/{ev}/media").json() == []
    assert not ingest.organizing(ev)  # it can be organized again


def test_cancel_route_reaches_a_running_job(client):
    go = threading.Event()

    def work(report):
        go.wait(5)
        jobs.checkpoint(report)
        report("saving", 1, 1)

    job_id = jobs.start(work)
    assert client.post(f"/jobs/{job_id}/cancel").json() == {"cancelling": True}
    go.set()
    with client.stream("GET", f"/jobs/{job_id}/events") as stream:
        lines = [line for line in stream.iter_lines() if line.startswith("data:")]
    assert '"cancelled"' in lines[0] and '"done"' in lines[1] and len(lines) == 2
    assert client.post("/jobs/nope/cancel").status_code == 404


def test_left_out_files_are_reported_not_silent(client, tmp_path, monkeypatch):
    folder = tmp_path / "phone"
    folder.mkdir()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(folder / "cake.jpg")
    (folder / "broken.jpg").write_bytes(b"not an image")
    for name in ("a.mp4", "b.mov"):
        (folder / name).write_bytes(b"x")

    def no_ffmpeg(src, out_dir):
        raise FileNotFoundError("ffmpeg")

    monkeypatch.setattr(ingest, "extract_frames", no_ffmpeg)
    monkeypatch.setattr(config, "has_tool", lambda name: False)
    ev = _event()
    progress = _ingest(client, ev, [folder])
    notes = [p["message"] for p in progress if p["stage"] == "warning"]
    assert notes[0] == "1 photo couldn't be opened and was left out."
    assert notes[1].startswith("2 videos were left out: FFmpeg isn't installed")
    assert progress[-1]["stage"] == "done" and len(client.get(f"/events/{ev}/media").json()) == 1

    monkeypatch.setattr(config, "has_tool", lambda name: True)
    assert ingest._left_out(0, 1) == ["1 video couldn't be read and was left out."]
    assert ingest._left_out(0, 0) == []


def test_reply_language_is_the_users_choice(client, event, monkeypatch):
    monkeypatch.setattr(config, "SCENE_TAGS", [])  # the real ones need the real text encoder
    assert "language the user writes in" in owl._facts(event)[0]
    assert "Always reply in Filipino" in owl._facts(event, "filipino")[0]
    assert client.post(f"/events/{event}/ask", json={"messages": [{"role": "user", "content": "hi"}], "language": "klingon"}).status_code == 422


def test_older_database_gets_the_new_column(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "old.sqlite3")
    with closing(sqlite3.connect(config.DB_PATH)) as old, old:
        old.execute("CREATE TABLE media(id INTEGER PRIMARY KEY, event_id INTEGER, path TEXT, kind TEXT, moment TEXT)")
        old.execute("INSERT INTO media(event_id, path, kind, moment) VALUES (1, 'a.jpg', 'photo', 'Cake')")
    with closing(db.connect()) as con:
        assert con.execute("SELECT moment_locked FROM media").fetchone()["moment_locked"] == 0
