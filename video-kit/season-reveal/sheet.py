import sys, glob, os
from PIL import Image, ImageDraw
src, out, cols = sys.argv[1], sys.argv[2], int(sys.argv[3]); files = sorted(glob.glob(src + "/f-*.png"))
if len(sys.argv) > 4: files = [f for f in files if any(k in os.path.basename(f) for k in sys.argv[4:])]
tw, th = 640, 360; rows = (len(files) + cols - 1) // cols; sheet = Image.new("RGB", (cols * tw, rows * th), "black"); d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((tw, th), Image.LANCZOS); x, y = (i % cols) * tw, (i // cols) * th; sheet.paste(im, (x, y)); d.text((x + 6, y + 4), os.path.basename(f)[2:-4], fill=(255, 255, 0))
sheet.save(out); print("sheet", out, len(files), "frames")
