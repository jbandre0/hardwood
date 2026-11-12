"""Naive-Bayes 'AI-likeness' of a source tree, using only VISUAL design features (no tooling fingerprints).
usage: python3 score.py <site-root> [label]      (reads css/, js/, *.html)"""
import json, math, os, sys
from analyze import feats
F = json.load(open("features.json"))
ai, hu = F["ai"], F["human"]
VIS = [k for k, v in ai[0].items() if isinstance(v, bool) and not k.startswith("t_") and k not in ("lorem_ipsum", "shadcn_hsl_tokens")]

def fit(A, H):
    m = {}
    for k in VIS:
        pa = (sum(f[k] for f in A) + 1) / (len(A) + 2); ph = (sum(f[k] for f in H) + 1) / (len(H) + 2)
        m[k] = (math.log(pa / ph), math.log((1 - pa) / (1 - ph)))
    return m
def lo(m, f): return sum(m[k][0] if f[k] else m[k][1] for k in VIS)

# leave-one-out accuracy: how separable are AI vs human on visual features alone?
correct = 0
for i, f in enumerate(ai):
    correct += lo(fit(ai[:i] + ai[i + 1:], hu), f) > 0
for i, f in enumerate(hu):
    correct += lo(fit(ai, hu[:i] + hu[i + 1:]), f) <= 0
print(f"leave-one-out accuracy on 200 repos using {len(VIS)} visual features: {correct/200*100:.0f}% (chance 50%)")
M = fit(ai, hu)
base = sum(m[1] for m in M.values())  # log-odds when no feature is present
def site_texts(root):
    t = {}
    for sub in ("css", "js", "js/pages"):
        d = os.path.join(root, sub)
        if os.path.isdir(d):
            for f in sorted(os.listdir(d)):
                p = os.path.join(d, f)
                if os.path.isfile(p) and f.endswith((".css", ".js")): t[f"{sub}/{f}"] = open(p).read()
    for f in os.listdir(root):
        if f.endswith(".html"): t[f] = open(os.path.join(root, f)).read()
    return t
if len(sys.argv) > 1:
    root = sys.argv[1]; f = feats(site_texts(root))
    # score distribution of the human / AI training sets, for context
    sa = sorted(lo(M, x) for x in ai); sh = sorted(lo(M, x) for x in hu)
    q = lambda a, p: a[int(p * (len(a) - 1))]
    s = lo(M, f)
    print(f"\n{sys.argv[2] if len(sys.argv) > 2 else root}: AI-likeness log-odds {s:+.1f}   (human repos: median {q(sh,.5):+.1f}, 90th pct {q(sh,.9):+.1f} | AI repos: median {q(sa,.5):+.1f}, 10th pct {q(sa,.1):+.1f})")
    print(f"  percentile among human repos: {sum(x < s for x in sh)}% | among AI repos: {sum(x < s for x in sa)}%")
    print("  features present, with evidence weight (positive = looks AI):")
    for k in sorted(VIS, key=lambda k: -abs(M[k][0] - M[k][1])):
        if f[k]: print(f"    {k:26s} {M[k][0]-M[k][1]:+5.2f}")
    print("  absent AI-typical features (nothing to fix):", ", ".join(k for k in VIS if not f[k] and M[k][0] > M[k][1] + 0.5) or "none")
