# Builds dist\Kuha\ : a folder with Kuha.exe that runs without Python, Node or a terminal, then wraps it in
# dist\KuhaSetup.exe, the installer to share (needs Inno Setup 6; without it that step is skipped with a message).
#   .\build.bat                    (or: powershell -ExecutionPolicy Bypass -File build.ps1)
#   .\build.bat -ImportDevData     also copies this checkout's data\ to where Kuha.exe keeps its data, if that is empty
#   .\build.bat -NoInstaller       stops after dist\Kuha\ (the installer step takes a few minutes)
# Needs the dev setup (run.bat once) and internet the first time, for PyInstaller and the CLIP weights.
param([switch]$ImportDevData, [switch]$NoInstaller)
$ErrorActionPreference = 'Stop'
$backend = Join-Path $PSScriptRoot 'backend'
$frontend = Join-Path $PSScriptRoot 'frontend'
$py = Join-Path $backend '.venv\Scripts\python.exe'
$out = Join-Path $PSScriptRoot 'dist\Kuha'

# a terminal opened before FFmpeg/ExifTool were installed does not see them, so read PATH fresh
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function Check($what) {
    if ($LASTEXITCODE -ne 0) { throw "$what failed (exit code $LASTEXITCODE)." }
}

if (-not (Test-Path $py)) { throw 'No Python environment yet. Run run.bat once, then build again.' }
if (Get-Process Kuha -ErrorAction SilentlyContinue) { throw 'Kuha.exe is running. Close its window, then build again.' }

& $py -m pip install -q -r (Join-Path $backend 'requirements-build.txt')
Check 'Installing the build packages'

# --- CLIP weights: the same file the dev setup uses, from the Hugging Face cache ---
$hf = if ($env:HF_HOME) { $env:HF_HOME } else { Join-Path $env:USERPROFILE '.cache\huggingface' }
$snapshots = Join-Path $hf 'hub\models--laion--CLIP-ViT-B-32-laion2B-s34B-b79K\snapshots'
if (-not (Test-Path $snapshots)) {
    Write-Host 'Downloading the CLIP model (one time, needs internet)...'
    & $py (Join-Path $backend 'scripts\download_models.py')
    Check 'Downloading the model'
}
$weights = Get-ChildItem $snapshots -Recurse -Filter 'open_clip_model.safetensors' | Select-Object -First 1
if (-not $weights) { throw "Can't find open_clip_model.safetensors under $snapshots." }

# --- UI ---
Push-Location $frontend
try {
    if (-not (Test-Path 'node_modules')) { npm install; Check 'Installing the frontend packages' }
    npm run build
    Check 'Building the UI'
}
finally { Pop-Location }

# --- engine ---
& $py -m PyInstaller (Join-Path $backend 'kuha.spec') --noconfirm `
    --distpath (Join-Path $PSScriptRoot 'dist') --workpath (Join-Path $PSScriptRoot 'build')
Check 'PyInstaller'

New-Item -ItemType Directory -Force (Join-Path $out 'models'), (Join-Path $out 'tools') | Out-Null
Copy-Item $weights.FullName (Join-Path $out 'models\open_clip_model.safetensors')  # the cache holds a link; this copies the file

# --- FFmpeg and ExifTool: whatever this machine has on PATH. Kuha.exe looks in tools\ first, then on PATH. ---
foreach ($tool in 'ffmpeg', 'ffprobe', 'exiftool') {
    $found = Get-Command $tool -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $found) {
        Write-Warning "$tool is not on PATH, so it is not in the build: $(if ($tool -eq 'exiftool') { 'XMP keywords and ratings' } else { 'videos' }) will need it installed on the user's machine."
        continue
    }
    Copy-Item $found.Source (Join-Path $out "tools\$tool.exe")
    $perl = Join-Path (Split-Path $found.Source) 'exiftool_files'  # ExifTool for Windows is a small exe plus this folder
    if ($tool -eq 'exiftool' -and (Test-Path $perl)) { Copy-Item $perl (Join-Path $out 'tools\exiftool_files') -Recurse }
}
Set-Content (Join-Path $out 'tools\LICENSES.txt') -Encoding utf8 -Value @'
Kuha ships these programs unmodified and runs them as separate processes.

FFmpeg (ffmpeg.exe, ffprobe.exe): https://ffmpeg.org, build from https://www.gyan.dev/ffmpeg/builds/
  Licensed under the GNU General Public License version 3. Source code: https://ffmpeg.org/download.html
ExifTool (exiftool.exe, exiftool_files): https://exiftool.org, by Phil Harvey
  Licensed under the same terms as Perl (GPL or Artistic License).
'@

# --- optional: bring this checkout's events along ---
if ($ImportDevData) {
    $from = Join-Path $PSScriptRoot 'data'
    $to = Join-Path $env:LOCALAPPDATA 'Kuha\data'
    if (-not (Test-Path (Join-Path $from 'kuha.sqlite3'))) { Write-Warning "No data to import: $from has no database." }
    elseif (Test-Path (Join-Path $to 'kuha.sqlite3')) { Write-Warning "Not importing: $to already has a database. Nothing was changed." }
    else {
        New-Item -ItemType Directory -Force $to | Out-Null
        Copy-Item (Join-Path $from '*') $to -Recurse
        # the database stores full paths to previews and example photos; point them at the copy
        & $py -c "import sqlite3, sys; old, new = sys.argv[1:]; con = sqlite3.connect(new + r'\kuha.sqlite3'); con.execute('UPDATE media SET preview_path = replace(preview_path, ?, ?)', (old, new)); con.execute('UPDATE refs SET image_path = replace(image_path, ?, ?)', (old, new)); con.commit()" $from $to
        Check 'Importing the data'
        Write-Host "Copied $from to $to (the checkout's own data is untouched)."
    }
}

$size = (Get-ChildItem $out -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host ("Built {0}  ({1:N2} GB). Double-click Kuha.exe inside it to start." -f $out, ($size / 1GB))

# --- installer: dist\KuhaSetup.exe, the one file to hand to someone (installer\kuha.iss) ---
if ($NoInstaller) { return }
$iscc = (Get-Command iscc -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $iscc) {
    $iscc = "$env:LOCALAPPDATA\Programs", ${env:ProgramFiles(x86)}, $env:ProgramFiles |
        ForEach-Object { Join-Path $_ 'Inno Setup 6\ISCC.exe' } | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $iscc) {
    Write-Warning 'No installer was made: Inno Setup 6 is not installed. Get it with "winget install JRSoftware.InnoSetup" (or from https://jrsoftware.org/isdl.php) and build again. dist\Kuha\ above is complete without it.'
    return
}
Write-Host 'Making the installer (compressing takes a few minutes)...'
& $iscc /Qp (Join-Path $PSScriptRoot 'installer\kuha.iss')
Check 'Making the installer'
$setup = Get-Item (Join-Path $PSScriptRoot 'dist\KuhaSetup.exe')
Write-Host ("Built {0}  ({1:N2} GB). Run it to install Kuha for the current user." -f $setup.FullName, ($setup.Length / 1GB))
