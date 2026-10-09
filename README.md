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
8. **Ask the owl (optional)** — Chat about an event ("what moments are we still missing?") with a local LLM through [Ollama](https://ollama.com/) on your own machine. Skip it and everything else still works.
9. **Local profiles** — On launch, pick *Who's organizing?*. Each profile keeps its own mode, events, and preferences, with an optional PIN to keep family members out of a pro's gigs. Stored in your browser only; no account.

### Pro mode adds
10. **Gig tracking** — Client, date, venue, fee, paid status, and project stage.
11. **RAW support + editor integration** — Writes keywords (`Kuha|Debut|18 Roses`, `A-roll`, `B-roll`) into XMP sidecars so they appear in Lightroom Classic, darktable, and RapidRAW. Talking/scenery clips are labeled **A-roll / B-roll**.
12. **Selects vs. finals** — Reads your star ratings, matches edited exports back to their RAWs (even after renaming), and flags selects that haven't been edited yet.
13. **Pro export structure** — `01_RAW/<moment>/`, `02_SELECTS/`, `03_FINALS/`, `04_VIDEO/A-ROLL/`, `04_VIDEO/B-ROLL/`, `05_REFERENCES/`.

---

## How it works

```
React UI (localhost:5173)  ──REST/SSE──►  FastAPI backend (localhost:8000)
                                            ├─ Previews: Pillow + pillow-heif (phone) / rawpy (RAW)
                                            ├─ Video: FFmpeg frames + Silero VAD
                                            ├─ Embeddings: OpenCLIP ViT-B-32
                                            ├─ Moments: text descriptions + your example photos
                                            ├─ Highlights: duplicate grouping (pHash) + sharpness
                                            ├─ Missed-moment check, search, finals matcher
                                            ├─ XMP writer (Pro): ExifTool
                                            └─ Ask the owl ──► Ollama (127.0.0.1:11434, optional)
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
**Create a profile → Personal mode → New Event → Birthday template → Organize → choose your folder.**

### Verify it's offline
After `download_models.py`, turn off Wi-Fi and run the full flow. Nothing breaks.

### Run the tests
```bash
cd backend && pytest
cd frontend && npm test
```

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

Measured with `python scripts/eval.py`, **offline**. Full output: [`results.md`](results.md) (2026-10-09 run). The only set so far is `personal_coco` (birthday template, 91 photos), and its labels are still a **draft** — treat these as early numbers.

| Metric | Result | Test set |
|---|---|---|
| Moment accuracy — descriptions only | 73.7% | 76 held-out photos |
| Moment accuracy — with 1 example photo per moment | 44.7% | same 76 photos |
| Moment accuracy — pro event (RAW) | _not measured yet_ | — |
| Missed moments correctly flagged | 3 / 8 | 8 hidden moments |
| Near-duplicates grouped (pairwise P / R / F1) | 100% / 86.7% / 92.9% | 30 duplicate pairs |
| Search: correct photo in top 5 | 6 / 6 | 6 queries |
| Talking vs. scenery clip accuracy | _not measured yet_ (no videos in set) | — |
| Finals → RAW match accuracy (Pro) | _not measured yet_ (no finals in set) | — |
| Processing speed (preview + embed) | 40.9 photos/sec | 91 photos |
| Organizing time: manual vs. Kuha | _TBD_ | — |

**Hardware:** Apple Silicon Mac (arm64), PyTorch on MPS.

Example photos currently *lower* accuracy on this set; the classifier weights are untuned (`backend/app/config.py`).

**Known limitations:** Phone photos must be copied to a computer first (no phone app yet). CLIP can confuse visually similar moments; example photos reduce this. Very dark or blurry frames often land in *Unsorted*. Heavy crops in edited finals can prevent matching.

---

## Demo

📹 Demo video: _link to X / LinkedIn post_

---

## Team

_Team name and members exactly as on the official AppBuildersPH participant list._

Built during the AppBuildersPH Local AI Hackathon, October 2026. #AppBuildersPH
