import io
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = PUBLIC / "stockProducts.json"
OUT_DIR = PUBLIC / "product-images"


def safe_name(code: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "-", code).strip("-") or "product"


def trim_white_padding(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    width, height = image.size
    pixels = image.load()

    min_x, min_y = width, height
    max_x, max_y = -1, -1

    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            if not (r > 245 and g > 245 and b > 245):
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x < min_x or max_y < min_y:
        return image

    pad = max(12, int(min(width, height) * 0.055))
    left = max(0, min_x - pad)
    top = max(0, min_y - pad)
    right = min(width, max_x + pad)
    bottom = min(height, max_y + pad)

    cropped = image.crop((left, top, right, bottom))
    cropped.thumbnail((700, 700), Image.Resampling.LANCZOS)
    return cropped


def fetch_image(url: str) -> Image.Image:
    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urlopen(req, timeout=18) as response:
        return Image.open(io.BytesIO(response.read()))


def main() -> int:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 240
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    products = json.loads(DATA.read_text(encoding="utf-8-sig"))

    processed = 0
    failed = 0
    for product in products[:limit]:
        url = product.get("image")
        code = product.get("code", "")
        if not url or not str(url).startswith("http"):
            continue

        filename = f"{safe_name(code)}.webp"
        output = OUT_DIR / filename
        product["localImage"] = f"/product-images/{filename}"

        if output.exists():
            processed += 1
            continue

        try:
            image = fetch_image(url)
            trimmed = trim_white_padding(image)
            trimmed.save(output, "WEBP", quality=88, method=6)
            processed += 1
        except Exception:
            product.pop("localImage", None)
            failed += 1

    DATA.write_text(json.dumps(products, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"processed": processed, "failed": failed, "limit": limit}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
