#!/usr/bin/env python3
"""Map the site's 365 team names to logo files from a local clone of GreenGuitar0/CBB-Team-Logos.
usage: python3 tools/logo_map.py <path-to-clone/pngs> [--write]
With --write: copies/optimizes matched PNGs to assets/logos/<slug>.png and writes data/logos.json."""
import json, os, re, sys, unicodedata, shutil
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1]
teams = json.load(open(os.path.join(ROOT, "data/teams.json")))
pngs = {f[:-4]: f for f in os.listdir(src) if f.endswith(".png")}

# hand-built aliases: our name -> logo file stem. Renamed schools whose only logo is the OLD name's are left out on purpose.
ALIAS = {
 "Albany (NY)": "Albany", "American": "American University", "Bryant": "Bryant University", "College of Charleston": "Charleston",
 "FDU": "Fairleigh Dickinson", "Grambling": "Grambling State", "Le Moyne": "lemoyne-alternate", "Little Rock": "Arkansas-Little Rock",
 "Long Island": "LIU", "Louisiana": "Louisiana-Lafayette", "Loyola (IL)": "Loyola Chicago", "McNeese": "McNeese State",
 "Miami": "Miami (FL)", "NC State": "North Carolina State", "Omaha": "Nebraska-Omaha", "Penn": "Pennsylvania",
 "Saint Joseph's": "Saint Joseph's (PA)", "Sam Houston": "Sam Houston State", "South Carolina Upstate": "USC Upstate",
 "Southern": "Southern University", "Southern Mississippi": "Southern Miss", "St. Thomas": "St. Tomas",
 "Texas A&M–Corpus Christi": "Texas A&M-CC", "The Citadel": "Citadel", "UNC Wilmington": "North Carolina-Wilmington",
 "UT Arlington": "Texas-Arlington", "Uconn": "Connecticut", "VCU": "Virginia Commonwealth", "VMI": "Virginia Military",
}
# deliberately skipped (only an outdated logo exists): Houston Christian (HBU), IU Indy (IUPUI), East Texas A&M (Commerce), Mercyhurst, New Haven, West Georgia

def norm(s):
    s = unicodedata.normalize("NFKD", s).lower().replace("–", "-").replace("&", "and").replace("'", "").replace("’", "")
    s = re.sub(r"^st\.? ", "saint ", s)
    s = re.sub(r"\bst\.?(?=\s|$)", "state", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()
byn = {}
for k in pngs: byn.setdefault(norm(k), k)

def slug(s):
    s = s.lower().replace("&", "and").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

out, how = {}, {"exact": 0, "normalized": 0, "alias": 0}
for t in teams:
    n = t["name"]
    if n in ALIAS: f, h = ALIAS[n], "alias"
    elif n in pngs: f, h = n, "exact"
    elif norm(n) in byn: f, h = byn[norm(n)], "normalized"
    else: continue
    out[t["slug"]] = f; how[h] += 1
print(how, "matched", len(out), "of", len(teams))
if "--verbose" in sys.argv:
    for t in teams:
        if t["slug"] in out and out[t["slug"]] != t["name"]: print(f"  {t['name']:28s} -> {out[t['slug']]}")
print("no logo:", [t["name"] for t in teams if t["slug"] not in out])

if "--write" in sys.argv:
    from PIL import Image
    dst = os.path.join(ROOT, "assets/logos"); shutil.rmtree(dst, ignore_errors=True); os.makedirs(dst)
    total = 0
    for s, f in out.items():
        im = Image.open(os.path.join(src, pngs[f] if f in pngs else f + ".png")).convert("RGBA")
        im.thumbnail((144, 144))
        q = im.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        p = os.path.join(dst, s + ".png"); q.save(p, optimize=True); total += os.path.getsize(p)
    # tone: very dark marks vanish on the dark theme, very light ones on the cream theme; the UI gives those a backing disc
    tones = {}
    for s_ in out:
        im = Image.open(os.path.join(dst, s_ + ".png")).convert("RGBA")
        lum = sorted((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 for r, g, b, a in im.getdata() if a > 128)
        if not lum: continue
        mean, p90 = sum(lum) / len(lum), lum[int(len(lum) * .9)]
        if mean < 0.20 and p90 < 0.40: tones[s_] = "dark"
        elif mean > 0.78: tones[s_] = "light"
    json.dump({s_: ({"f": s_ + ".png", "t": tones[s_]} if s_ in tones else {"f": s_ + ".png"}) for s_ in out}, open(os.path.join(ROOT, "data/logos.json"), "w"), separators=(",", ":"), sort_keys=True)
    print("tones:", len(tones), "flagged:", sorted(tones))
    print(f"wrote {len(out)} logos, {total/1e6:.2f} MB")
