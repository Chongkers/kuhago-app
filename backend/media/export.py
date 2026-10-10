"""Export folder layouts (AGENTS.md Agent 9). Copy, never move; never overwrite an existing file."""
import logging
import re
import shutil
import sqlite3
from pathlib import Path

from app import config

log = logging.getLogger(__name__)


def sanitize(name: str) -> str:
    """Windows-safe folder name; mirrors sanitizeFolder in frontend/src/lib/exportPlan.ts."""
    return re.sub(r'\s*[<>:"/\\|?*]\s*', " - ", name).strip().rstrip(".") or "_"


def plan_export(con: sqlite3.Connection, event_id: int) -> dict:
    """Dry run: {root, copies: [{src, dest}]} with dest relative to the folder the user picks."""
    ev = con.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    media = con.execute("SELECT * FROM media WHERE event_id = ? ORDER BY id", (event_id,)).fetchall()
    photos = [m for m in media if m["kind"] == "photo"]
    videos = [m for m in media if m["kind"] == "video"]

    def moment(m):
        return sanitize(m["moment"] or config.UNSORTED)

    date = ev["date"] or "undated"
    if ev["mode"] == "pro":
        root = f"{date}_{sanitize(ev['client'] or 'Client')}_{sanitize(ev['name'])}"
        finals = con.execute("SELECT path FROM finals WHERE event_id = ? ORDER BY id", (event_id,)).fetchall()
        refs = con.execute(
            "SELECT r.image_path FROM refs r JOIN shot_items s ON s.id = r.shot_item_id WHERE s.event_id = ? ORDER BY r.id",
            (event_id,),
        ).fetchall()
        pairs = [
            *((m["path"], f"01_RAW/{moment(m)}") for m in photos),
            *((m["path"], "02_SELECTS") for m in photos if m["is_select"] or (m["rating"] or 0) >= config.SELECT_MIN_RATING),
            *((f["path"], "03_FINALS") for f in finals),
            *((m["path"], "04_VIDEO/A-ROLL") for m in videos if m["roll"] == "A"),
            *((m["path"], "04_VIDEO/B-ROLL") for m in videos if m["roll"] != "A"),
            *((r["image_path"], "05_REFERENCES") for r in refs),
        ]
    else:
        root = f"{date}_{sanitize(ev['name'])}"
        sorted_ = [m for m in photos if (m["moment"] or config.UNSORTED) != config.UNSORTED]
        pairs = [
            *((m["path"], "Highlights") for m in photos if m["is_highlight"]),
            *((m["path"], "Favorites") for m in media if m["is_select"]),
            *((m["path"], f"Moments/{moment(m)}") for m in sorted_),
            *((m["path"], "Videos/Talking") for m in videos if m["roll"] == "A"),
            *((m["path"], "Videos/Scenery") for m in videos if m["roll"] != "A"),
            *((m["path"], "Unsorted") for m in photos if m not in sorted_),
        ]

    used: set[str] = set()  # lowercased dests: Windows and macOS folders are case-insensitive
    copies = []
    for src, folder in pairs:
        p = Path(src)
        name, n = p.name, 1
        while f"{folder}/{name}".lower() in used:  # two phones both shot IMG_0001.jpg
            n += 1
            name = f"{p.stem}_{n}{p.suffix}"
        used.add(f"{folder}/{name}".lower())
        copies.append({"src": src, "dest": f"{root}/{folder}/{name}"})
    return {"root": root, "copies": copies}


def execute_export(report, copies: list[dict], dest: Path) -> None:
    """Background job: copy each planned file under dest. Bad or existing files are skipped, never fatal;
    files that could not be copied are reported once the rest are done."""
    failed = 0
    for i, c in enumerate(copies, 1):
        target = dest / c["dest"]
        try:
            if target.exists():
                log.info("exists, skip %s", target)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(c["src"], target)
        except OSError as e:
            log.warning("skip %s: %s", c["src"], e)
            failed += 1
        report("copying", i, len(copies))
    if failed:
        raise RuntimeError(f"{failed} of {len(copies)} files could not be copied. The rest are in the folder.")
