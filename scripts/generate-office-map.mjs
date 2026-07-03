/**
 * Regenerate public/proto-office-map.jpg from Carto Voyager tiles.
 * Requires: python3 + pillow (pip install pillow)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/proto-office-map.jpg');

const py = `
from PIL import Image, ImageDraw
import urllib.request
import math

lat, lng = -33.9280367, 18.4286137
zoom = 16
width, height = 640, 240
tile_size = 256
tile_url = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'

def lng_lat_to_px(lng, lat, z):
    s = tile_size * 2**z
    x = (lng + 180) / 360 * s
    sin_lat = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + sin_lat) / (1 - sin_lat)) / (4 * math.pi)) * s
    return x, y

cx, cy = lng_lat_to_px(lng, lat, zoom)
ox, oy = cx - width/2, cy - height/2
sx, sy = int(ox // tile_size), int(oy // tile_size)
ex, ey = int((ox + width) // tile_size), int((oy + height) // tile_size)

canvas = Image.new('RGB', (width, height), (245, 247, 250))
for tx in range(sx, ex + 1):
    for ty in range(sy, ey + 1):
        url = tile_url.format(z=zoom, x=tx, y=ty)
        req = urllib.request.Request(url, headers={'User-Agent': 'ProtoTradingSite/1.0'})
        with urllib.request.urlopen(req) as resp:
            tile = Image.open(resp).convert('RGB')
        canvas.paste(tile, (int(tx * tile_size - ox), int(ty * tile_size - oy)))

draw = ImageDraw.Draw(canvas)
px, py = int(cx - ox), int(cy - oy)
# modern pin: soft shadow + brand red dot + gold ring
draw.ellipse((px-11, py-9, px+11, py+13), fill=(0, 0, 0, 40))
draw.ellipse((px-10, py-10, px+10, py+10), fill=(224, 32, 32))
draw.ellipse((px-6, py-6, px+6, py+6), fill=(255, 255, 255))
draw.ellipse((px-3, py-3, px+3, py+3), fill=(224, 32, 32))

canvas.save('${out.replace(/\\/g, '/')}', 'JPEG', quality=92, optimize=True)
print('saved ${out.replace(/\\/g, '/')}')
`;

const result = spawnSync('python3', ['-c', py], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
