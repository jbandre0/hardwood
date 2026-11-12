#!/usr/bin/env python3
"""Phase 1: build candidate repo pools via the GitHub search API (reachable from this container).
Writes pools.json. Labels come from the repo itself (AI markers) or from creation date (human, pre-2021)."""
import json, os, sys, time, urllib.request, urllib.parse, random
API = "https://api.github.com/search/repositories"
def search(q, pages=3, sort="stars"):
    out = []
    for p in range(1, pages + 1):
        url = f"{API}?q={urllib.parse.quote(q)}&per_page=100&page={p}&sort={sort}&order=desc"
        for attempt in range(4):
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "research-script"}), timeout=40) as r:
                    d = json.load(r); break
            except Exception as e:
                err = str(e); time.sleep(6 * (attempt + 1)); d = None
        time.sleep(2.3)  # search limit is 30/min
        if not d or not d.get("items"):
            print("  stop", q[:60], "page", p, (d or {}).get("message") or (err if d is None else "no items")); break
        out += d["items"]
        if len(d["items"]) < 100: break
    return out

AI_Q = [
  ("lovable", '"Welcome to your Lovable project" in:readme fork:false created:>2025-01-01', 4),
  ("lovable-topic", "topic:lovable fork:false", 2),
  ("v0", "topic:v0 fork:false", 2),
  ("v0-readme", '"v0.dev" in:readme fork:false created:>2024-06-01', 2),
  ("bolt", "topic:bolt-new fork:false", 2),
  ("bolt-readme", '"bolt.new" in:readme fork:false created:>2024-09-01', 2),
  ("vibe", "topic:vibe-coding language:TypeScript fork:false", 2),
]
HUMAN_Q = [
  ("portfolio-html", "portfolio website language:HTML created:<2021-01-01 fork:false stars:>=3", 3),
  ("landing-html", "landing page language:HTML created:<2021-01-01 fork:false stars:>=3", 3),
  ("website-css", "website language:CSS created:<2021-01-01 fork:false stars:>=3", 3),
  ("personal-js", "personal website language:JavaScript created:<2021-01-01 fork:false stars:>=3", 2),
  ("tailwind-html", "tailwindcss website created:<2021-01-01 language:HTML fork:false", 2),
  ("tailwind-js", "tailwindcss landing created:<2021-01-01 language:JavaScript fork:false", 2),
  ("tailwind-vue", "tailwindcss created:<2021-01-01 language:Vue fork:false", 2),
  ("bootstrap-site", "bootstrap website template created:<2021-01-01 language:HTML fork:false stars:>=3", 2),
]
pools = {"ai": [], "human": []}
for label, qs in (("ai", AI_Q), ("human", HUMAN_Q)):
    seen = set()
    for tag, q, pages in qs:
        items = search(q, pages)
        n = 0
        for r in items:
            if r["full_name"] in seen or r.get("fork") or r.get("archived") or r["size"] < 20: continue
            seen.add(r["full_name"]); n += 1
            pools[label].append(dict(repo=r["full_name"], branch=r["default_branch"], created=r["created_at"][:10], lang=r["language"], size=r["size"], stars=r["stargazers_count"], src=tag))
        print(f"{label:6s} {tag:16s} got {len(items):4d} new {n:4d}")
json.dump(pools, open("pools.json", "w"), indent=0)
print({k: len(v) for k, v in pools.items()})
