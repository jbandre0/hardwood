import json, math, statistics
from analyze import fisher
F = json.load(open("features.json"))
ai, hu = F["ai"], F["human"]
hu_tw = [f for f in hu if f["_group"].startswith("tailwind")]
hu_pl = [f for f in hu if not f["_group"].startswith("tailwind")]
bools = [k for k, v in ai[0].items() if isinstance(v, bool)]
rows = []
for k in bools:
    a = sum(f[k] for f in ai); h = sum(f[k] for f in hu); t = sum(f[k] for f in hu_tw); p = sum(f[k] for f in hu_pl)
    pa, ph, pt = a / len(ai), h / len(hu), t / len(hu_tw)
    rows.append(dict(k=k, ai=pa, hu=ph, tw=pt, pl=p / len(hu_pl), diff=pa - ph, diff_tw=pa - pt,
                     p_all=fisher(a, len(ai) - a, h, len(hu) - h), p_tw=fisher(a, len(ai) - a, t, len(hu_tw) - t)))
rows.sort(key=lambda r: -abs(r["diff"]))
print(f"{'feature':26s} {'AI':>5s} {'human':>6s} {'hu-TW':>6s} {'hu-plain':>8s} | {'AI-hu':>6s} {'p(all)':>8s} | {'AI-huTW':>7s} {'p(TW)':>8s}")
for r in rows:
    flag = "***" if r["p_all"] < 0.002 and r["p_tw"] < 0.05 else ("**" if r["p_all"] < 0.002 else ("*" if r["p_all"] < 0.05 else ""))
    print(f"{r['k']:26s} {r['ai']*100:4.0f}% {r['hu']*100:5.0f}% {r['tw']*100:5.0f}% {r['pl']*100:7.0f}% | {r['diff']*100:+5.0f} {r['p_all']:8.4f} | {r['diff_tw']*100:+6.0f} {r['p_tw']:8.4f} {flag}")
json.dump(rows, open("comparison.json", "w"), indent=1)
print("\nnumeric:")
for k in ("n_fonts", "n_radius_big_share"):
    print(f"  {k}: AI median {statistics.median(f[k] for f in ai)} | human {statistics.median(f[k] for f in hu)} | human-TW {statistics.median(f[k] for f in hu_tw)}")
print("\nper AI tool (share with feature) for top discriminators:")
top = [r["k"] for r in rows if r["k"][:2] != "t_"][:8]
for g in ("lovable", "v0", "bolt", "vibe"):
    sub = [f for f in ai if f["_group"] == g]
    print(f"  {g:8s} n={len(sub):2d}", " ".join(f"{k[:14]}={sum(f[k] for f in sub)/len(sub)*100:3.0f}%" for k in top))
