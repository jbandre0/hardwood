#!/usr/bin/env python3
"""Repair: Season 1's box.json was exported with possessions rounded to 1 decimal. Possessions are an exact formula of the other
box fields (FGA - OR + TO + 0.437*FTA), so recompute them. Asserts every value moves by < 0.05 (i.e. only the rounding is restored)."""
import json, os
p = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data/seasons/season-1/box.json")
d = json.load(open(p)); fixed = 0
for row in d["rows"]:
    for o in (2, 13):  # FGM FGA 3PM 3PA FTM FTA OR DR TO ST POSS
        fga, fta, orr, to, poss = row[o + 1], row[o + 5], row[o + 6], row[o + 8], row[o + 10]
        f = round((fga - orr) + to + 0.437 * fta, 3)
        assert abs(f - poss) < 0.05, (row[0], f, poss)
        if abs(f - poss) > 1e-9: fixed += 1
        row[o + 10] = f
json.dump(d, open(p, "w"), separators=(",", ":"))
print("recomputed possessions; values changed:", fixed, "of", len(d["rows"]) * 2)
