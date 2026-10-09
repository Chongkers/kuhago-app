"""Kuha.exe: the engine and the built UI in one windowed process, shown in a window of its own (Edge WebView2).
Closing the window quits Kuha. Only a build made by build.ps1 starts here; developers use run.bat (AGENTS.md §11)."""
import ctypes
import logging
import multiprocessing
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from ctypes import wintypes
from urllib.parse import urlsplit

from app import config
from app.routes import dialog

URL = f"http://{config.APP_HOST}:{config.APP_PORT}"
ICON = config.RESOURCE_DIR / "kuha.ico"
LOG_MAX_BYTES = 5_000_000  # past this the log starts over; the previous one is kept as kuha.log.old
QUIT_WAIT = 5  # seconds the engine gets to finish its requests before it is stopped anyway
ALREADY_EXISTS = 183
SHOW_EVENT = "Kuha.Show"  # a second launch sets this; the running Kuha brings its window to the front
WEBVIEW2_KEY = r"Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
WINDOW_SIZE = (1200, 720)
WINDOW_MIN_SIZE = (900, 600)
# The window only ever shows this laptop's engine, so the browser inside it gets none of its background traffic
# (component updates, SmartScreen lookups, usage reports): Kuha makes no network calls at runtime.
WEBVIEW2_ARGS = ("--disable-background-networking --disable-component-update --disable-domain-reliability "
                 "--disable-sync --no-pings --disable-features=msSmartScreenProtection")
STARTING_PAGE = """<!doctype html><meta charset="utf-8"><title>Kuha</title>
<style>
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; background: #fff; color: #1f2937; font-family: "Segoe UI", sans-serif; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  p { font-size: 14px; margin: 0 0 18px; color: #4b5563; }
  .bar { width: 340px; height: 4px; border-radius: 2px; background: #e5e7eb; overflow: hidden; }
  .bar::after { content: ""; display: block; width: 40%; height: 100%; background: #2563eb;
                animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
</style>
<main><h1>Starting Kuha…</h1><p>Loading the AI model. This can take up to a minute.</p><div class="bar"></div></main>"""

log = logging.getLogger("kuha.launcher")
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32.CreateMutexW.restype = kernel32.CreateEventW.restype = kernel32.OpenEventW.restype = wintypes.HANDLE
kernel32.CreateEventW.argtypes = (wintypes.LPVOID, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR)
kernel32.OpenEventW.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR)
kernel32.SetEvent.argtypes = (wintypes.HANDLE,)
kernel32.WaitForSingleObject.argtypes = (wintypes.HANDLE, wintypes.DWORD)
user32.MessageBoxW.argtypes = (wintypes.HWND, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.UINT)
user32.IsIconic.argtypes = user32.SetForegroundWindow.argtypes = (wintypes.HWND,)
user32.ShowWindow.argtypes = (wintypes.HWND, ctypes.c_int)

_ollama: subprocess.Popen | None = None  # the Ollama that Kuha started, if it had to


def _listening(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(1)
        return s.connect_ex((config.APP_HOST, port)) == 0


def _message(text: str, error: bool = False) -> None:
    user32.MessageBoxW(None, text, "Kuha", 0x10 if error else 0x40)


def _log_to_file() -> None:
    """A windowed exe has no console and no stdout: everything printed or logged goes to LOG_PATH instead."""
    config.LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if config.LOG_PATH.exists() and config.LOG_PATH.stat().st_size > LOG_MAX_BYTES:
        config.LOG_PATH.replace(config.LOG_PATH.with_suffix(".log.old"))
    out = open(config.LOG_PATH, "a", buffering=1, encoding="utf-8", errors="replace")
    sys.stdout = sys.stderr = out
    logging.basicConfig(stream=out, level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


class _Engine(threading.Thread):
    """uvicorn in this process. Importing the app pulls in PyTorch and its startup loads CLIP, so both happen here,
    behind the starting window."""

    def __init__(self):
        super().__init__(name="engine", daemon=True)
        self.server = None

    def run(self) -> None:
        try:
            import uvicorn

            from app.main import app

            # log_config=None: uvicorn's own setup writes to a console that isn't there
            self.server = uvicorn.Server(uvicorn.Config(app, host=config.APP_HOST, port=config.APP_PORT, log_config=None))
            self.server.run()
        except BaseException:
            log.exception("the engine stopped")

    @property
    def ready(self) -> bool:
        return self.server is not None and self.server.started

    def stop(self) -> None:
        if self.server is not None:
            self.server.should_exit = True
            self.join(QUIT_WAIT)
            self.server.force_exit = True  # an open progress stream would otherwise keep it waiting
            self.join(QUIT_WAIT)


def _has_webview2() -> bool:
    """The Edge WebView2 runtime: part of Windows 11, an optional install on Windows 10."""
    import winreg

    for root, sub in ((winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node"), (winreg.HKEY_LOCAL_MACHINE, "SOFTWARE"),
                      (winreg.HKEY_CURRENT_USER, "SOFTWARE")):
        try:
            with winreg.OpenKey(root, rf"{sub}\{WEBVIEW2_KEY}") as key:
                if winreg.QueryValueEx(key, "pv")[0] not in ("", "0.0.0.0"):
                    return True
        except OSError:
            pass
    return False


def _hwnd(window) -> int | None:
    try:
        return window.native.Handle.ToInt64()
    except Exception:  # not on screen yet
        return None


def _raise_when_asked(window, event) -> None:
    """A second launch of Kuha.exe sets the event instead of starting another engine."""
    while kernel32.WaitForSingleObject(event, 0xFFFFFFFF) == 0:
        hwnd = _hwnd(window)
        if hwnd:
            if user32.IsIconic(hwnd):
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
            user32.SetForegroundWindow(hwnd)


def _window(engine: _Engine) -> bool | None:
    """Kuha's own window, from the starting page shown while CLIP loads until the user closes it: closing quits
    Kuha. True once the engine answered, False if it stopped instead, None if the window could not be shown."""
    try:
        import webview

        var = "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"
        os.environ[var] = f"{os.environ.get(var, '')} {WEBVIEW2_ARGS}".strip()
        # Maximized: a 1366x768 laptop screen is smaller than the photo grid wants; WINDOW_SIZE is the restored size.
        # text_select: chat replies and paths can be copied. zoomable: Ctrl + wheel, as in a browser.
        window = webview.create_window("Kuha", html=STARTING_PAGE, width=WINDOW_SIZE[0], height=WINDOW_SIZE[1],
                                       min_size=WINDOW_MIN_SIZE, maximized=True, text_select=True, zoomable=True)
    except Exception:
        log.exception("could not create the window")
        return None
    started = threading.Event()
    shown = threading.Event()
    window.events.shown += shown.set

    def closing() -> bool:
        """False keeps the window open. A job stops with Kuha, so say so first."""
        from app import jobs

        if not started.is_set() or not jobs.running():
            return True
        # MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2; 6 = Yes
        return user32.MessageBoxW(_hwnd(window), "Kuha is still working on your photos. If you quit now, it stops "
                                  "partway.\n\nQuit anyway?", "Kuha", 0x4 | 0x30 | 0x100) == 6

    window.events.closing += closing

    def run() -> None:
        while not engine.ready and engine.is_alive():
            time.sleep(0.2)
        if not engine.ready:
            return window.destroy()
        started.set()
        _start_ollama()
        window.load_url(URL)

    threading.Thread(target=_raise_when_asked, args=(window, kernel32.CreateEventW(None, False, False, SHOW_EVENT)),
                     daemon=True).start()
    try:
        # private_mode off + a fixed folder: chats and the profile live in the window's own browser storage and
        # must still be there on the next start
        webview.start(run, gui="edgechromium", private_mode=False, storage_path=str(config.WEBVIEW_DIR),
                      icon=str(ICON))
    except Exception:
        log.exception("the window stopped")
        if not shown.is_set():
            return None
    return started.is_set()


def _browser(engine: _Engine) -> bool:
    """Without the WebView2 runtime there is no window: the UI opens as a tab in the default browser and Kuha
    stays in the tray until Quit."""
    if not _starting_window(engine):
        return False
    _start_ollama()
    webbrowser.open(URL)
    _tray()
    return True


def _starting_window(engine: _Engine) -> bool:
    """The browser path's "Starting Kuha…" window. True once the engine answers, False if it stopped instead.
    Closing the window cancels the start."""
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("Kuha")
    root.iconbitmap(default=str(ICON))
    root.resizable(False, False)
    frame = ttk.Frame(root, padding=24)
    frame.pack()
    ttk.Label(frame, text="Starting Kuha…", font=("Segoe UI", 14, "bold")).pack(anchor="w")
    ttk.Label(frame, text="Loading the AI model. This can take up to a minute.\nYour browser opens when it's ready.",
              font=("Segoe UI", 10)).pack(anchor="w", pady=(6, 14))
    bar = ttk.Progressbar(frame, mode="indeterminate", length=340)
    bar.pack()
    bar.start(12)
    root.update_idletasks()
    x = (root.winfo_screenwidth() - root.winfo_width()) // 2
    y = (root.winfo_screenheight() - root.winfo_height()) // 2
    root.geometry(f"+{x}+{y}")
    root.attributes("-topmost", True)
    root.protocol("WM_DELETE_WINDOW", lambda: os._exit(0))

    def poll() -> None:
        if engine.ready or not engine.is_alive():
            root.destroy()
        else:
            root.after(200, poll)

    root.after(200, poll)
    root.mainloop()
    return engine.ready


def _start_ollama() -> None:
    """Ask KuhaGo needs Ollama running. Start it hidden when it is installed and not already up; without it
    the rest of the app works the same."""
    global _ollama
    exe = shutil.which("ollama")
    if not exe or _listening(urlsplit(config.OLLAMA_URL).port):
        return
    try:
        _ollama = subprocess.Popen([exe, "serve"], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, creationflags=config.NO_WINDOW)
    except OSError as e:
        log.warning("could not start Ollama: %s", e)


def _tray() -> None:
    """Blocks until the user picks Quit."""
    import pystray
    from PIL import Image

    icon = pystray.Icon("Kuha", Image.open(ICON), "Kuha", pystray.Menu(
        pystray.MenuItem("Open Kuha", lambda: webbrowser.open(URL), default=True),
        pystray.MenuItem("Quit Kuha", lambda: icon.stop()),
    ))

    def shown(icon) -> None:
        icon.visible = True
        # Windows tucks a new tray icon into the ^ overflow, so say where it is
        icon.notify("Kuha is running. To quit, right-click the Kuha icon near the clock.", "Kuha")

    icon.run(setup=shown)


def main() -> None:
    multiprocessing.freeze_support()
    if dialog.HELPER_FLAG in sys.argv:
        try:
            return dialog.run_helper()
        except Exception:  # an error box here would sit unseen and hold up the engine, which is waiting for "ready"
            _log_to_file()
            log.exception("the folder window helper stopped")
            sys.exit(1)

    # One engine per user. A second double-click brings the running Kuha's window to the front.
    mutex = kernel32.CreateMutexW(None, False, "Kuha.SingleInstance")  # noqa: F841  (held until the process ends)
    if ctypes.get_last_error() == ALREADY_EXISTS:
        user32.AllowSetForegroundWindow(-1)  # this process was just started by the user; the running one was not
        event = kernel32.OpenEventW(0x2, False, SHOW_EVENT)  # EVENT_MODIFY_STATE
        if event:
            kernel32.SetEvent(event)
        elif _listening(config.APP_PORT):  # the browser path; if it is still starting it opens the browser itself
            webbrowser.open(URL)
        return

    _log_to_file()
    log.info("starting Kuha from %s, data in %s", config.APP_DIR, config.DATA_DIR)
    os.environ["HF_HUB_OFFLINE"] = "1"  # never look for model files on the network
    if _listening(config.APP_PORT):
        log.error("port %s is taken by another program", config.APP_PORT)
        return _message(f"Kuha can't start: another program is using port {config.APP_PORT}.\n"
                        "Close that program, then open Kuha again.", error=True)

    engine = _Engine()
    engine.start()
    started = _window(engine) if _has_webview2() else None
    if started is None:
        log.info("no window (the WebView2 runtime is missing or did not start): using the browser and the tray")
        started = _browser(engine)

    failed = not started and not engine.is_alive()  # it stopped by itself; closing the window mid-start is no error
    log.info("quitting")
    engine.stop()
    if _ollama is not None:  # only the one Kuha started; /T because `ollama serve` has child processes
        subprocess.run(["taskkill", "/PID", str(_ollama.pid), "/T", "/F"], capture_output=True, creationflags=config.NO_WINDOW)
    if failed:
        _message(f"Kuha couldn't start.\n\nThe details are in this file:\n{config.LOG_PATH}", error=True)
    os._exit(0)  # a job still copying or embedding must not keep the process (and the port) alive


if __name__ == "__main__":
    main()
