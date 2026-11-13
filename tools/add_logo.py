"""Add or replace one team logo without touching the others.

    python3 tools/add_logo.py <team-slug> <image> [--erase x0,y0,x1,y1 ...]

Trims the transparent margin, pads to a square with a little air, scales to 144x144 like the rest of assets/logos,
quantizes to 128 colours, works out whether the mark is very dark or very light (the UI gives those a backing disc)
and updates data/logos.json for that slug only. --erase clears a box (source pixels) first, e.g. a TM mark.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
slug, src = sys.argv[1], sys.argv[2]
teams = {t["slug"] for t in json.load(open(os.path.join(ROOT, "data/league.json")))}
if slug not in teams: sys.exit(f"unknown team slug {slug}")
im = Image.open(src).convert("RGBA")
args = sys.argv[3:]
while args:
    if args[0] == "--erase":
        x0, y0, x1, y1 = map(int, args[1].split(",")); im.paste((0, 0, 0, 0), (x0, y0, x1, y1)); args = args[2:]
    else: sys.exit("unknown option " + args[0])
a = im.getchannel("A").point(lambda v: 255 if v > 8 else 0)
im = im.crop(a.getbbox())
side = int(max(im.size) * 1.04)
canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0)); canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
canvas = canvas.resize((144, 144), Image.LANCZOS)
q = canvas.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
out = os.path.join(ROOT, "assets/logos", slug + ".png"); q.save(out, optimize=True)
lum = sorted((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 for r, g, b, al in (lambda i: i.get_flattened_data() if hasattr(i, "get_flattened_data") else i.getdata())(Image.open(out).convert("RGBA")) if al > 128)
mean, p90 = sum(lum) / len(lum), lum[int(len(lum) * .9)]
tone = "dark" if mean < 0.20 and p90 < 0.40 else "light" if mean > 0.78 else None
path = os.path.join(ROOT, "data/logos.json"); m = json.load(open(path))
m[slug] = {"f": slug + ".png", **({"t": tone} if tone else {})}
json.dump(m, open(path, "w"), separators=(",", ":"), sort_keys=True)
print(f"{slug}: {os.path.getsize(out)} bytes, tone {tone or 'normal'} (mean {mean:.2f}, p90 {p90:.2f})")
