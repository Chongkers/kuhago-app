"""POST /pick-folder: the OS folder window, so a folder path doesn't have to be typed."""
import logging
import subprocess
import sys
import threading

from fastapi import APIRouter, HTTPException

log = logging.getLogger(__name__)
router = APIRouter()

# Runs in its own process: Tk wants the main thread, and FastAPI handlers run in worker threads.
# It stays alive between picks: starting Python and Tk is most of the wait, so a warm helper opens the window
# in about a tenth of a second. It exits by itself when the engine does (stdin closes).
_HELPER = """
import sys
import tkinter as tk
from tkinter import filedialog
sys.stdout.reconfigure(encoding="utf-8")
root = tk.Tk()
root.withdraw()
root.attributes("-topmost", True)
print("ready", flush=True)
for _ in sys.stdin:
    root.update()
    print(filedialog.askdirectory(parent=root, title="Choose a folder", mustexist=True), flush=True)
"""

_proc: subprocess.Popen | None = None
_lock = threading.Lock()  # one window at a time; the helper answers one line per request


def _helper() -> subprocess.Popen:
    """The running helper, started if there is none (first use, or it died)."""
    global _proc
    if _proc is None or _proc.poll() is not None:
        _proc = subprocess.Popen(
            [sys.executable, "-c", _HELPER], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, encoding="utf-8",
        )
        if _proc.stdout.readline().strip() != "ready":  # no Tk on this machine, or no display
            _proc.kill()
            _proc = None
            raise OSError("folder window helper did not start")
    return _proc


def warm() -> None:
    """Start the helper ahead of the first click. Never fatal: typing a path always works."""
    try:
        with _lock:
            _helper()
    except OSError as e:
        log.warning("no folder window: %s", e)


def close() -> None:
    global _proc
    if _proc is not None:
        _proc.kill()
        _proc = None


@router.post("/pick-folder")
def pick_folder():
    """Open the OS folder window on this machine (the app is local) and return the chosen absolute path."""
    with _lock:
        try:
            proc = _helper()
            proc.stdin.write("pick\n")
            proc.stdin.flush()
            line = proc.stdout.readline()  # waits for as long as the window is open
        except OSError as err:
            raise HTTPException(503, "Can't open the folder window. Type the folder path instead.") from err
        if not line:  # the helper died mid-pick
            close()
            raise HTTPException(503, "Can't open the folder window. Type the folder path instead.")
    return {"path": line.strip() or None}  # None = the user cancelled
