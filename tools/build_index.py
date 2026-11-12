#!/usr/bin/env python3
"""Rebuild data/seasons/index.json 'files' lists from what is actually on disk (run after adding or removing season files)."""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); S = os.path.join(ROOT, "data", "seasons"); P = os.path.join(S, "index.json")
idx = json.load(open(P))
for s in idx:
    d = os.path.join(S, s["id"])
    s["files"] = sorted(f[:-5] for f in os.listdir(d) if f.endswith(".json")) if os.path.isdir(d) else []
json.dump(idx, open(P, "w"), separators=(",", ":"))
print({s["id"]: s["files"] for s in idx})
