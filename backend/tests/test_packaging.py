"""What Kuha.exe relies on: the API under /api beside the built UI, and tools shipped next to the exe."""
from fastapi.testclient import TestClient

from app import config


def test_ui_pages_get_the_built_ui_and_the_api_keeps_its_own_paths(tmp_path, monkeypatch):
    from app.main import app

    monkeypatch.setattr(config, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "data" / "kuha.sqlite3")
    ui = tmp_path / "ui"
    (ui / "assets").mkdir(parents=True)
    (ui / "index.html").write_text("<title>KuhaGo</title>", encoding="utf-8")
    (ui / "assets" / "app.js").write_text("// app", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("not part of the UI", encoding="utf-8")
    monkeypatch.setattr(config, "UI_DIR", ui)
    client = TestClient(app)  # no `with`: lifespan (CLIP load) never runs

    assert client.get("/api/events").json() == []
    for page in ("/", "/events", "/events/3", "/events/3/owl", "/owl", "/settings"):  # same paths as API routes had
        res = client.get(page)
        assert res.status_code == 200 and "KuhaGo" in res.text, page
    assert client.get("/assets/app.js").text == "// app"
    assert "KuhaGo" in client.get("/%2e%2e/secret.txt").text  # never a file outside the UI folder
    assert client.get("/api/nope").status_code == 404  # an unknown API path is not answered with a page

    monkeypatch.setattr(config, "UI_DIR", tmp_path / "no build")  # dev: Vite serves the UI
    assert client.get("/events").status_code == 404


def test_a_job_counts_as_running_until_it_reports_done(monkeypatch):
    import threading

    from app import jobs

    monkeypatch.setattr(jobs, "_jobs", {})
    assert jobs.running() == 0  # Kuha.exe closes without asking
    release, finished = threading.Event(), threading.Event()

    def work(report):
        report("previews", 0, 1)
        release.wait(5)

    job_id = jobs.start(work)
    assert jobs.running() == 1
    release.set()
    for _ in range(50):
        if jobs._jobs[job_id] and jobs._jobs[job_id][-1]["stage"] == "done":
            finished.set()
            break
        threading.Event().wait(0.05)
    assert finished.is_set() and jobs.running() == 0


def test_a_tool_shipped_with_the_build_wins_over_path(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "TOOLS_DIR", tmp_path)
    assert config.tool("ffmpeg") == "ffmpeg"
    (tmp_path / "ffmpeg.exe").write_bytes(b"")
    assert config.tool("ffmpeg") == str(tmp_path / "ffmpeg.exe")
    assert config.tool("exiftool") == "exiftool"
