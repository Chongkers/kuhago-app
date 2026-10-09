# PyInstaller recipe for Kuha.exe. Run through build.ps1, which builds the UI first and adds models/ and tools/ after.
from pathlib import Path

import torchvision
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

backend = Path(SPECPATH)
ui = backend.parent / "frontend" / "dist"

# torchvision loads its native ops by file name at import time, which PyInstaller cannot see; without them
# open_clip fails to import ("operator torchvision::nms does not exist")
torchvision = Path(torchvision.__file__).parent

a = Analysis(
    [str(backend / "launcher.py")],
    pathex=[str(backend)],
    binaries=[(str(p), "torchvision") for ext in ("*.pyd", "*.dll") for p in torchvision.glob(ext)],
    datas=[
        (str(backend / "templates"), "templates"),
        (str(backend / "kuha.ico"), "."),
        (str(ui), "ui"),
        *collect_data_files("open_clip"),   # tokenizer vocabulary, model configs
        *collect_data_files("silero_vad"),  # the VAD weights ship inside the package
    ],
    hiddenimports=[
        "app.main",  # imported inside the engine thread
        "tkinter.filedialog",  # used by the folder window helper, which is a string of code (routes/dialog.py)
        "pystray._win32",
        # the window: pywebview picks its platform module at run time, and pythonnet (clr) loads .NET from it
        "webview.platforms.winforms", "webview.platforms.edgechromium", "clr",
        *collect_submodules("uvicorn"),
        "sse_starlette", "python_multipart", "pillow_heif", "rawpy", "cv2", "imagehash",
    ],
    excludes=["pytest", "IPython", "matplotlib", "tensorboard"],
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="Kuha",
    console=False,  # no terminal window; output goes to %LOCALAPPDATA%\Kuha\logs\kuha.log
    icon=str(backend / "kuha.ico"),
)
COLLECT(exe, a.binaries, a.datas, name="Kuha")
