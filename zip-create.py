#!/usr/bin/env python3
"""Create a ZIP from a directory. Used by build-portable.ps1."""
import sys
import zipfile
from pathlib import Path


def main():
    if len(sys.argv) != 3:
        print("Usage: zip-create.py <source_dir> <output_zip>")
        sys.exit(1)
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    if not src.is_dir():
        print(f"Source not a directory: {src}")
        sys.exit(1)
    if out.exists():
        out.unlink()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(src.rglob("*")):
            if p.is_file():
                zf.write(p, p.relative_to(src))
    print(f"ZIP created: {out} ({out.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()