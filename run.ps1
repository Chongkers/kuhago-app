# Starts KuhaGo in one window: Ollama (optional), then the engine on :8000, which also serves the built UI.
# Closing this window stops KuhaGo. Safe to re-run: if it is already up, this just opens the browser.
# First run also installs what is missing and puts a KuhaGo shortcut on the Desktop.
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

# --- UI build: redone whenever the UI source is newer than the last build (e.g. after a git pull) ---
$built = Join-Path $frontend 'dist\index.html'
$newest = Get-ChildItem (Join-Path $frontend 'src'), (Join-Path $frontend 'public'), (Join-Path $frontend 'index.html') -Recurse -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not (Test-Path $built) -or $newest.LastWriteTime -gt (Get-Item $built).LastWriteTime) {
    Write-Host 'Building the UI...'
    Push-Location $frontend
    npm run build
    Pop-Location
    Check 'Building the UI'
}

# --- Desktop shortcut (first run; delete it and it comes back next run) ---
$lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) 'KuhaGo.lnk'
if (-not (Test-Path $lnk)) {
    $s = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
    $s.TargetPath = Join-Path $PSScriptRoot 'run.bat'
    $s.WorkingDirectory = $PSScriptRoot
    $s.IconLocation = Join-Path $PSScriptRoot 'kuhago.ico'
    $s.Save()
    Write-Host 'Added a KuhaGo shortcut to your Desktop.'
}

$url = 'http://127.0.0.1:8000'
if (Listening 8000) {
    Write-Host "KuhaGo is already running: $url"
    Start-Process $url
    exit
}

# the engine loads CLIP before it answers (slow on CPU), so open the browser from the side once it does
Start-Job -ArgumentList $url {
    param($url)
    foreach ($i in 1..90) {
        try { Invoke-WebRequest "$url/events" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $url; break }
        catch { Start-Sleep -Seconds 2 }
    }
} | Out-Null

$host.UI.RawUI.WindowTitle = 'KuhaGo'
Write-Host "Starting KuhaGo at $url (the browser opens when it is ready). Close this window to stop KuhaGo."
Set-Location $backend
& $py -m uvicorn app.main:app --port 8000
