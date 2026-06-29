"""Generate transparent favicon assets from public/proto-logo.png."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
SOURCE = PUBLIC / 'proto-logo.png'


def build_logo_rgba() -> Image.Image:
    img = Image.open(SOURCE).convert('RGBA')
    data = np.array(img)
    r, g, b, a = data[..., 0], data[..., 1], data[..., 2], data[..., 3]
    sat = r.astype(int) - np.maximum(g, b)
    logo = (r > 90) & (sat > 35) & (a > 100)

    out = data.copy()
    out[~logo] = (0, 0, 0, 0)
    clean = Image.fromarray(out, 'RGBA')

    ys, xs = np.where(logo)
    x0, x1 = xs.min(), xs.max()
    y0, y1 = ys.min(), ys.max()
    pad = int(max(x1 - x0, y1 - y0) * 0.08)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(clean.width - 1, x1 + pad), min(clean.height - 1, y1 + pad)
    cropped = clean.crop((x0, y0, x1 + 1, y1 + 1))

    w, h = cropped.size
    side = max(w, h)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.paste(cropped, ((side - w) // 2, (side - h) // 2))
    return square


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f'Missing {SOURCE}')

    master = build_logo_rgba()
    sizes = {
        'favicon-16x16.png': 16,
        'favicon-32x32.png': 32,
        'apple-touch-icon.png': 180,
        'favicon-192.png': 192,
        'favicon.png': 512,
    }
    icons = {}
    for name, size in sizes.items():
        icons[name] = master.resize((size, size), Image.Resampling.LANCZOS)
        icons[name].save(PUBLIC / name)

    icons['favicon-32x32.png'].save(
        PUBLIC / 'favicon.ico',
        format='ICO',
        sizes=[(16, 16), (32, 32), (48, 48)],
    )
    print(f'Wrote favicon assets to {PUBLIC}')


if __name__ == '__main__':
    main()
