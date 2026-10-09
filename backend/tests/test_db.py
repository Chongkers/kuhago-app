import numpy as np
import pytest

from app import config, db


@pytest.fixture(autouse=True)
def tmp_data(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "kuha.sqlite3")


def _unit(n):
    x = np.random.rand(n, config.EMB_DIM).astype(np.float32)
    return x / np.linalg.norm(x, axis=1, keepdims=True)


def test_media_roundtrip_fetches_embedding_by_emb_index():
    con = db.connect()
    event_id = con.execute("INSERT INTO events(mode, name) VALUES ('personal', 'Lola 80th')").lastrowid
    emb = _unit(3)
    idx = db.append_embeddings(event_id, emb)
    for i, path in zip(idx, ["a.jpg", "b.jpg", "c.jpg"]):
        con.execute("INSERT INTO media(event_id, path, kind, emb_index) VALUES (?, ?, 'photo', ?)", (event_id, path, i))
    con.commit()

    row = db.connect().execute("SELECT emb_index FROM media WHERE path = 'b.jpg'").fetchone()
    np.testing.assert_array_equal(db.load_embeddings(event_id)[row["emb_index"]], emb[1])


def test_append_continues_row_numbers():
    a, b = _unit(2), _unit(3)
    assert db.append_embeddings(7, a) == [0, 1]
    assert db.append_embeddings(7, b) == [2, 3, 4]
    np.testing.assert_array_equal(db.load_embeddings(7), np.vstack([a, b]))


def test_missing_event_has_no_embeddings():
    emb = db.load_embeddings(99)
    assert emb.shape == (0, config.EMB_DIM)
    assert emb.dtype == np.float32


def test_mode_is_checked():
    with pytest.raises(Exception):
        db.connect().execute("INSERT INTO events(mode, name) VALUES ('wedding', 'x')")
