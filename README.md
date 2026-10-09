# Kuha — Local AI Organizer for Every Filipino Celebration

> *Working name. "Kuha" = Filipino for "take / shot."*

After every birthday, Noche Buena, graduation, barkada trip, debut, or wedding, the same thing happens: hundreds of photos and videos pile up across phones and memory cards, nobody sorts them, and you only find out later that **nobody got a photo of the cake or the whole family together.**

Kuha fixes that — **entirely on your own laptop, with no internet and nothing uploaded.** It sorts photos and videos into the moments of your event, picks the best shots, tells you which moments you **missed**, and exports everything into clean, shareable folders.

It works for everyone:

| | **Personal mode** — for anyone | **Pro mode** — for freelance photographers & videographers |
|---|---|---|
| Who | Families, students, barkadas, hobbyists | Event shooters doing paid gigs |
| Files | Phone photos & videos (JPEG, HEIC, MP4, MOV) | Plus RAW files and camera video |
| Gets | Moments, missed-moment check, highlights, search, organized export | Everything in Personal, plus gig tracking, XMP keywords for Lightroom / darktable / RapidRAW, and selects-vs-finals matching |

---

## Why does this product benefit from running AI locally?

| Reason | Why the cloud fails here |
|---|---|
| **Family privacy** | Event photos are full of children, relatives, and private family moments. Nobody should have to upload them to a third-party AI server just to get them organized. |
| **File size and data cost** | A single family event easily produces several gigabytes of phone photos and video; a pro shoot can be 30–100 GB. At a 20 Mbps upload, 50 GB takes over 5 hours before any AI even runs — and uploading costs data. Kuha analyzes everything where it already is. |
| **Works anywhere** | Venues, resorts, and provinces often have weak or no signal. The missed-moment check is most useful *before you leave the event*. Kuha runs fully offline. |
| **Free** | No subscriptions, no per-photo fees, no cloud storage to buy. It runs on a laptop you already own. |

---

## Features

### For everyone
1. **Events + moment checklist** — Create an event and load a template: *Birthday, Noche Buena / Christmas, Graduation, Trip / Outing, Family Reunion, Debut, Wedding, Binyag*. Add or remove moments, and drop in a few example photos to teach Kuha what you mean.
2. **Auto-organize** — Point Kuha at a folder of photos and videos. Everything is grouped into moments (e.g., *Blowing the Candles, Gift Opening, Group Photo, Food*). Unclear shots go to **Unsorted** instead of being guessed.
3. **Missed-moment check** — See which moments on your checklist have **no photos**, so you can still take them while everyone's there.
4. **Highlights** — Kuha removes near-duplicates and blurry shots and picks the best few photos per moment, ready to post or send to the family group chat.
5. **Talking vs. scenery clips** — Videos are split into clips where someone is talking (messages, speeches, greetings) and clips of the scene.
6. **Search** — Type what you're looking for ("lola with the cake," "group photo at the beach") and find it instantly — offline.
7. **Organized export** — Copy everything into a clean folder structure. Originals are never moved or changed.
   ```
   2026-12-24_Noche Buena/
     Highlights/
     Moments/<moment>/
     Videos/Talking/   Videos/Scenery/
     Unsorted/
   ```

### Pro mode adds
8. **Gig tracking** — Client, date, venue, fee, paid status, and project stage.
9. **RAW support + editor integration** — Writes keywords (`Kuha|Debut|18 Roses`, `A-roll`, `B-roll`) into XMP sidecars so they appear in Lightroom Classic, darktable, and RapidRAW. Talking/scenery clips are labeled **A-roll / B-roll**.
10. **Selects vs. finals** — Reads your star ratings, matches edited exports back to their RAWs (even after renaming), and flags selects that haven't been edited yet.
11. **Pro export structure** — `01_RAW/<moment>/`, `02_SELECTS/`, `03_FINALS/`, `04_VIDEO/A-ROLL/`, `04_VIDEO/B-ROLL/`, `05_REFERENCES/`.

---

## How it works

```
React UI (localhost:5173)  ──REST/SSE──►  FastAPI backend (localhost:8000/api)
                                            ├─ Previews: Pillow + pillow-heif (phone) / rawpy (RAW)
                                            ├─ Video: FFmpeg frames + Silero VAD
                                            ├─ Embeddings: OpenCLIP ViT-B-32
                                            ├─ Moments: text descriptions + your example photos
                                            ├─ Highlights: duplicate grouping (pHash) + sharpness
                                            ├─ Missed-moment check, search, finals matcher
                                            └─ XMP writer (Pro): ExifTool
                                         SQLite + .npy embeddings (all local)
```

Each moment is recognized by combining CLIP similarity to a visual description (e.g., "a child blowing out candles on a birthday cake") with similarity to your own example photos. Low-confidence items go to **Unsorted**.

---

## Models, frameworks & tools used (disclosure)

| Purpose | Tool |
|---|---|
| Image/frame embeddings & search | [OpenCLIP](https://github.com/mlfoundations/open_clip) — `ViT-B-32`, pretrained `laion2b_s34b_b79k` |
| Speech detection (talking clips) | [Silero VAD](https://github.com/snakers4/silero-vad) |
| Phone photos (HEIC) | [pillow-heif](https://github.com/bigcat88/pillow_heif) |
| RAW preview extraction | [rawpy](https://github.com/letmaik/rawpy) (LibRaw) |
| Sharpness scoring | [OpenCV](https://opencv.org/) |
| Video frames & audio | [FFmpeg](https://ffmpeg.org/) |
| Duplicate detection & matching | [ImageHash](https://github.com/JohannesBuchner/imagehash) |
| Metadata read/write | [ExifTool](https://exiftool.org/) |
| "Ask the owl" chat (optional) | [Ollama](https://ollama.com/) on localhost — default `llama3.2:3b`, or any model you pull |
| Backend | Python, FastAPI, SQLite, PyTorch |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Development | AI-assisted development (Devin / coding agents) |

All AI inference runs locally. No cloud AI API is used.

---

## Setup (judges: start here)

### Requirements
- Python 3.11+
- Node.js 20+
- FFmpeg and ExifTool on your `PATH`
  - **Windows:** `winget install Gyan.FFmpeg` and `winget install OliverBetz.ExifTool`
  - **macOS:** `brew install ffmpeg exiftool`
  - **Linux:** `sudo apt install ffmpeg libimage-exiftool-perl`
- Optional, for **Ask the owl**: [Ollama](https://ollama.com/) running locally, then `ollama pull llama3.2:3b` (one-time download). Without it, everything else works.
- Optional: NVIDIA GPU (CUDA) or Apple Silicon (MPS) for faster processing. CPU works.

### 1. Backend
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_models.py     # one-time download; everything after this runs offline
uvicorn app.main:app --port 8000
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                           # opens http://localhost:5173
```

### 3. Try it
Use any folder of event photos and videos (phone or camera). In the app:
**Personal mode → New Event → Birthday template → Organize → choose your folder.**

### Verify it's offline
After `download_models.py`, turn off Wi-Fi and run the full flow. Nothing breaks.

### Windows: Kuha.exe (no Python, Node or terminal)

**Build** (on a machine with the setup above, once per release):
```
build.bat
```
It builds the UI, freezes the engine with PyInstaller into `dist\Kuha\` (about 1.8 GB: PyTorch, the CLIP weights, and the FFmpeg and ExifTool found on your `PATH`), then wraps that folder in one installer, `dist\KuhaSetup.exe` (about 860 MB). Share the installer.
- The installer step needs [Inno Setup 6](https://jrsoftware.org/isdl.php) (`winget install JRSoftware.InnoSetup`). Without it the build says so and stops after `dist\Kuha\`, which also runs as is: double-click `Kuha.exe` inside it.
- `-NoInstaller` skips the installer step (it takes a few minutes). `-ImportDevData` also copies the events from this checkout's `data\` into the place Kuha.exe keeps its data.

**Install:** run `KuhaSetup.exe`. It installs for the current user only, asks for no administrator password, and adds Kuha to the Start menu and, if you leave the box ticked, the desktop. Copying the files takes a few minutes.

**Run:** open Kuha from the Start menu or the desktop.
- Kuha opens in its own window, with no browser and no terminal. It shows "Starting Kuha…" while the AI model loads (up to a minute or so on a laptop CPU), then the app.
- **To quit, close the window.** That stops Kuha completely; nothing keeps running in the background. If Kuha is in the middle of organizing or exporting, it asks before quitting.
- Opening Kuha again while it is running brings its window to the front.
- Your events are stored in `%LOCALAPPDATA%\Kuha\data`, your profile and chats in `%LOCALAPPDATA%\Kuha\webview`. If Kuha can't start, it says so and points to its log, `%LOCALAPPDATA%\Kuha\logs\kuha.log`.
- The window keeps its own profile and chats. Ones you made in a browser tab (the developer setup, or an older Kuha.exe) do not appear in it.
- Made to work with Wi-Fi off: nothing is downloaded on first run. Ask KuhaGo still needs [Ollama](https://ollama.com/) installed separately.
- The window needs the Microsoft Edge WebView2 runtime, which is part of Windows 11. On a Windows 10 machine without it, Kuha opens in your browser instead and sits in the system tray (near the clock); right-click its icon → **Quit Kuha** to stop it.

**Uninstall:** Settings → Apps → Installed apps → Kuha → Uninstall. This removes the program and its shortcuts. Your events, profile and chats in `%LOCALAPPDATA%\Kuha` are left alone; delete that folder yourself if you want them gone too.

`run.bat` remains the way to start Kuha for development.

---

## Getting phone photos onto your computer

Kuha runs on a laptop or desktop. Copy your photos and videos from your phone first — by USB cable, AirDrop, or by downloading a shared Google Drive / Photos album. HEIC (iPhone) and MOV/MP4 videos are supported. Collecting everyone's phone photos into one folder gives the best missed-moment check.

---

## Pro mode: using Kuha with your editor

Kuha writes keywords into XMP sidecars (a backup of every existing sidecar is saved in `.kuha_backup/` first). Choose your editor in **Settings → Sidecar mode**:

| Editor | Sidecar name | To see Kuha's keywords |
|---|---|---|
| Lightroom Classic | `IMG_0001.xmp` | Select photos → *Metadata → Read Metadata from Files* |
| darktable | `IMG_0001.CR3.xmp` | Enable *look for updated XMP files on startup*, or re-import the folder |
| RapidRAW | (XMP sync, v1.5+) | Reopen the folder |

**Selects:** Kuha reads star ratings (`xmp:Rating`). Lightroom pick flags are stored only in the catalog, so use star ratings for selects (or enable *Automatically write changes into XMP*).

---

## Results

Measured with `python scripts/eval.py` on our own labeled test sets, **offline**, on the hardware listed below. Numbers are filled in from the actual evaluation run.

| Metric | Result | Test set |
|---|---|---|
| Moment accuracy — personal event (phone photos), descriptions only | _TBD_ | _N photos_ |
| Moment accuracy — personal event, with example photos | _TBD_ | _N photos_ |
| Moment accuracy — pro event (RAW), with example photos | _TBD_ | _N photos_ |
| Missed moments correctly flagged | _TBD_ | _N moments_ |
| Near-duplicates correctly grouped | _TBD_ | _N bursts_ |
| Search: correct photo in top 5 | _TBD_ | _N queries_ |
| Talking vs. scenery clip accuracy | _TBD_ | _N clips_ |
| Finals → RAW match accuracy (Pro) | _TBD_ | _N finals_ |
| Processing speed | _TBD photos/sec_ | — |
| Organizing time: manual vs. Kuha | _TBD_ | — |

**Hardware:** _CPU / GPU / RAM of the test laptop_

**Known limitations:** Phone photos must be copied to a computer first (no phone app yet). CLIP can confuse visually similar moments; example photos reduce this. Very dark or blurry frames often land in *Unsorted*. Heavy crops in edited finals can prevent matching.

---

## Demo

📹 Demo video: _link to X / LinkedIn post_

---

## Team

_Team name and members exactly as on the official AppBuildersPH participant list._

Built during the AppBuildersPH Local AI Hackathon, October 2026. #AppBuildersPH
