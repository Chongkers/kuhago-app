# Starts everything Kuha needs in one go: Ollama (optional), the engine on :8000 and the UI on :5173.
# Safe to re-run: anything already listening is left alone. First run also installs what is missing.
#   .\run.bat        (or: powershell -ExecutionPolicy Bypass -File run.ps1)
$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$frontend = Join-Path $PSScriptRoot 'frontend'
$py = Join-Path $backend '.venv\Scripts\python.exe'

# a terminal opened before FFmpeg/ExifTool were installed does not see them, so read PATH fresh
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function Listening($port) {
    [bool](Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
}

function Check($what) {
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." }
}

function Window($title, $dir, $command) {
    Start-Process powershell -WorkingDirectory $dir -ArgumentList '-NoExit', '-Command', "`$host.UI.RawUI.WindowTitle = '$title'; $command"
}

# --- first-run setup ---
if (-not (Test-Path $py)) {
    Write-Host 'Creating the Python environment (first run only)...'
    if (Get-Command py -ErrorAction SilentlyContinue) { py -3.11 -m venv (Join-Path $backend '.venv') }
    else { python -m venv (Join-Path $backend '.venv') }
    Check 'Creating the Python environment'
    & $py -m pip install -r (Join-Path $backend 'requirements.txt')
    Check 'Installing the backend packages'
}
$hf = if ($env:HF_HOME) { $env:HF_HOME } else { Join-Path $env:USERPROFILE '.cache\huggingface' }
if (-not (Test-Path (Join-Path $hf 'hub\models--laion--CLIP-ViT-B-32-laion2B-s34B-b79K'))) {
    Write-Host 'Downloading the CLIP model (one time, needs internet)...'
    & $py (Join-Path $backend 'scripts\download_models.py')
    Check 'Downloading the model'
}
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Write-Host 'Installing the frontend packages (first run only)...'
    Push-Location $frontend
    npm install
    Pop-Location
    Check 'Installing the frontend packages'
}

# --- optional tools ---
foreach ($tool in 'ffmpeg', 'exiftool') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Warning "$tool is not on PATH: $(if ($tool -eq 'ffmpeg') { 'videos will be skipped' } else { 'XMP keywords and ratings are unavailable' })."
    }
}
if (Listening 11434) { Write-Host 'Ollama: already running' }
elseif (Get-Command ollama -ErrorAction SilentlyContinue) {
    Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden
    Write-Host 'Ollama: started'
}
else { Write-Warning 'Ollama is not installed: Ask KuhaGo will be unavailable, everything else works.' }

# --- engine + UI, each in its own window (close the window or press Ctrl+C there to stop it) ---
if (Listening 8000) { Write-Host 'Engine: already running on :8000' }
else {
    Window 'Kuha engine' $backend "& '$py' -m uvicorn app.main:app --port 8000"
    Write-Host 'Engine: starting on :8000'
}
# The UI is pinned to 127.0.0.1: another project's dev server on localhost ([::1]:5173) would otherwise
# be mistaken for Kuha, and "localhost" in the browser would open that project instead.
if (Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -LocalPort 5173 -ErrorAction SilentlyContinue) {
    Write-Host 'UI: already running on 127.0.0.1:5173'
}
else {
    Window 'Kuha UI' $frontend 'npm run dev -- --host 127.0.0.1'
    Write-Host 'UI: starting on 127.0.0.1:5173'
}

# the engine loads CLIP before it answers; that takes a while on CPU
Write-Host 'Waiting for the engine...' -NoNewline
$ready = $false
foreach ($i in 1..90) {
    try { Invoke-WebRequest 'http://127.0.0.1:8000/events' -UseBasicParsing -TimeoutSec 2 | Out-Null; $ready = $true; break }
    catch { Write-Host '.' -NoNewline; Start-Sleep -Seconds 2 }
}
Write-Host ''
if (-not $ready) { throw 'The engine did not come up. Look at the "Kuha engine" window for the error.' }

Start-Process 'http://127.0.0.1:5173'
Write-Host 'Kuha is running: http://127.0.0.1:5173'
