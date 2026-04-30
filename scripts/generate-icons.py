#!/usr/bin/env python3
"""
Resize icons/icon-source-512.png into extension sizes (16, 48, 128).
Requires Pillow: pip install Pillow
"""

from pathlib import Path

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Install Pillow: pip install Pillow") from None

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "icons" / "icon-source-512.png"
OUT_DIR = ROOT / "icons"
SIZES = (16, 48, 128)


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing source image: {SOURCE}")
    img = Image.open(SOURCE).convert("RGBA")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = img.crop((left, top, left + side, top + side))
    for size in SIZES:
        out = cropped.resize((size, size), Image.Resampling.LANCZOS)
        path = OUT_DIR / f"icon{size}.png"
        out.save(path, "PNG")
        print(f"Wrote {path}")


if __name__ == "__main__":
    main()
