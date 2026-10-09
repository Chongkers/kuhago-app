"""XMP sidecars via ExifTool (AGENTS.md Agent 9, Pro): read star ratings, write keyword tags only.
Every call is batched: one ExifTool process per read or write, never one per file."""
import json
import shutil
import subprocess
from pathlib import Path

from app import config

MODES = ("lightroom", "darktable")

# A new sidecar starts as an empty packet; ExifTool then adds the tags. Existing sidecars are never rewritten.
_EMPTY = (
    "<?xpacket begin='﻿' id='W5M0MpCehiHzreSzNTczkc9d'?>\n"
    "<x:xmpmeta xmlns:x='adobe:ns:meta/'>\n"
    "<rdf:RDF xmlns:rdf='http://www.w3.org/1999/02/22-rdf-syntax-ns#'>\n"
    "</rdf:RDF>\n</x:xmpmeta>\n<?xpacket end='w'?>\n"
)


class ExifToolMissing(RuntimeError):
    pass


def sidecar_path(src: Path, mode: str) -> Path:
    """lightroom: IMG_0001.xmp; darktable: IMG_0001.CR3.xmp."""
    return src.with_suffix(".xmp") if mode == "lightroom" else src.with_name(src.name + ".xmp")


def _exiftool(args: list[str], *common: str) -> subprocess.CompletedProcess:
    """Arguments go through stdin (one per line), so thousands of paths never hit the command-line limit.
    `common` applies to every -execute command (ExifTool does not allow -common_args inside an argfile)."""
    try:
        return subprocess.run(
            ["exiftool", "-@", "-", "-common_args", "-charset", "filename=utf8", *common],
            input="\n".join(args).encode("utf-8"), capture_output=True, timeout=config.EXIFTOOL_TIMEOUT,
        )
    except FileNotFoundError as e:
        raise ExifToolMissing("ExifTool isn't installed. Install it, then try again.") from e


def read_ratings(srcs: list[Path]) -> dict[Path, int]:
    """Star rating per original, read from its sidecar (either naming) or, without one, from the file itself."""
    target_of = {}
    for src in srcs:
        sidecars = [p for p in (sidecar_path(src, m) for m in reversed(MODES)) if p.exists()]
        if sidecars or src.exists():
            target_of[(sidecars[0] if sidecars else src).resolve()] = src
    if not target_of:
        return {}
    out = _exiftool(["-j", "-XMP:Rating", *map(str, target_of)]).stdout
    ratings = {}
    for row in json.loads(out or b"[]"):
        src = target_of.get(Path(row["SourceFile"]).resolve())
        if src is not None and isinstance(row.get("Rating"), (int, float)):
            ratings[src] = int(row["Rating"])
    return ratings


def write_keywords(items: list[tuple[Path, list[str], list[str]]], mode: str) -> int:
    """items: (original, flat keywords, hierarchical keywords). Backs up each existing sidecar once, then adds
    the keywords in one ExifTool run. Returns how many sidecars were written."""
    args, targets = [], []
    for src, flat, hier in items:
        if not src.exists() or not (flat or hier):
            continue
        sidecar = sidecar_path(src, mode)
        if sidecar.exists():
            backup = sidecar.parent / config.XMP_BACKUP_DIR / sidecar.name
            if not backup.exists():  # keep the oldest copy: the one from before Kuha touched it
                backup.parent.mkdir(exist_ok=True)
                shutil.copy2(sidecar, backup)
        else:
            sidecar.write_text(_EMPTY, encoding="utf-8")
        # -= then += : re-running never duplicates a keyword
        for kw in flat:
            args += [f"-XMP-dc:Subject-={kw}", f"-XMP-dc:Subject+={kw}"]
        for kw in hier:
            args += [f"-XMP-lr:HierarchicalSubject-={kw}", f"-XMP-lr:HierarchicalSubject+={kw}"]
        args += [str(sidecar), "-execute"]
        targets.append(sidecar)
    if not targets:
        return 0
    res = _exiftool(args[:-1], "-overwrite_original")
    if res.returncode != 0 and b"updated" not in res.stdout:
        raise RuntimeError(f"ExifTool could not write the keywords: {res.stderr.decode(errors='replace').strip()[:300]}")
    return sum(int(line.split()[0]) for line in res.stdout.decode(errors="replace").splitlines() if "image files updated" in line)
