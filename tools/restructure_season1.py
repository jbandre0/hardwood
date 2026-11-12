#!/usr/bin/env python3
"""One-time migration: move the single-season site data into data/seasons/season-1/ in the unified per-season format.
The original files are kept in backup/season1-site-data-before-multiseason/ (and in git history, tag pre-multiseason).
usage: python3 tools/restructure_season1.py "<Season 1 FINAL workbook>"   (used only for Season 1's starting stat lines)"""
import json, os, shutil, sys, warnings
import openpyxl
warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); D = os.path.join(ROOT, "data"); S1 = os.path.join(D, "seasons", "season-1")
if not os.path.exists(os.path.join(D, "teams.json")):
    print("already restructured"); sys.exit(0)
old = json.load(open(os.path.join(D, "teams.json")))
league = json.load(open(os.path.join(D, "league.json")))
assert [t["name"] for t in old] == [t["name"] for t in league]
# Season 1 starting stats = the Sim Teams sheet of the Season 1 workbook
wb = openpyxl.load_workbook(sys.argv[1], data_only=True, read_only=True)
rows = [list(r) for r in wb["Sim Teams"].iter_rows(values_only=True)]
hi = next(i for i, r in enumerate(rows) if r and "Pos in tier" in r); H = rows[hi]
cols = ["Games", "PPG", "REB", "ST", "BL", "TO", "FT%", "3P%", "OR", "DR", "FTA", "FGA", "2P%", "OEFG%", "STR*Ra", "HFA*Ra", "POSS", "Opp OR/G (TR)", "Opp eFG% (TR)", "Opp 2P% (TR)", "Opp 3P% (TR)", "Opp TO% (TR)", "Opp FTA/FGA (TR)", "FTA/FGA (TR)"]
byname = {r[1]: dict(zip(H, r)) for r in rows[hi + 1:] if r and r[1]}
new = []
for t in old:
    sr = byname[t["name"]]
    start = [round(sr[c], 6) for c in cols]
    final = [round(x, 6) if isinstance(x, float) else x for x in t["eng"][2:]]  # eng = [name, conf, Games, PPG...]
    assert len(final) == len(cols), (len(final), len(cols))
    new.append(dict(id=t["id"], conf=t["conf"], tier=sr["Tier used"] if sr.get("Tier used") else t["tier"], pos=round(sr["Pos in tier"], 9), start=start, final=final))
assert all(n["tier"] == t["tier"] for n, t in zip(new, old)), "tier mismatch between Season 1 workbook and site data"
os.makedirs(S1, exist_ok=True)
json.dump(new, open(os.path.join(S1, "teams.json"), "w"), separators=(",", ":"))
for f in ("games.json", "box.json", "ncaa.json", "meta.json"):
    shutil.move(os.path.join(D, f), os.path.join(S1, f))
# polls: keep the committee ballots in the unified shape
pl = json.load(open(os.path.join(D, "polls.json")))
json.dump(dict(ap=pl, power=[]), open(os.path.join(S1, "polls.json"), "w"), separators=(",", ":"))
os.remove(os.path.join(D, "polls.json")); os.remove(os.path.join(D, "teams.json"))
print("moved. data/ now:", sorted(os.listdir(D)), "| season-1:", sorted(os.listdir(S1)))
