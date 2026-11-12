#!/usr/bin/env python3
"""Phase 3: extract design features from each repo's source text, compare AI-built vs pre-2021 human-built,
and score arbitrary source dirs (e.g. this site) with a naive-Bayes 'AI-likeness' log-odds over the visual features.
Pure text/regex analysis: nothing from the corpus is ever executed."""
import json, math, os, re, sys, colorsys, collections, statistics
SC = "/tmp/claude-0/-home-user/07521494-4e74-5e21-b355-190f54e0e9fd/scratchpad/study"
MARKUP = (".html", ".htm", ".tsx", ".jsx", ".vue", ".svelte", ".js", ".ts")
STYLE = (".css", ".scss", ".sass", ".less")

TW_RADIUS = {"none": 0, "sm": 2, "": 4, "md": 6, "lg": 8, "xl": 12, "2xl": 16, "3xl": 24, "full": 9999}
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐✨⚡]")
BUZZ = re.compile(r"\b(seamless(ly)?|elevate|unlock|revolutioniz\w*|cutting-edge|empower\w*|leverage|streamlin\w*|next-gen\w*|effortless(ly)?|supercharge\w*|game-chang\w*|transform your|journey|harness)\b", re.I)

def hue_sat(h, s, l):
    return h, s

def colors_in(css):
    """yield (hue, sat, light) for hex, hsl(), and shadcn-style 'H S% L%' tokens"""
    out = []
    for m in re.finditer(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", css):
        h = m.group(1)
        if len(h) == 3: h = "".join(c * 2 for c in h)
        r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
        hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
        out.append((hh * 360, ss, ll))
    for m in re.finditer(r"hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%", css):
        out.append((float(m.group(1)), float(m.group(2)) / 100, float(m.group(3)) / 100))
    for m in re.finditer(r"--[\w-]+:\s*(\d{1,3}(?:\.\d+)?)\s+(\d{1,3}(?:\.\d+)?)%\s+(\d{1,3}(?:\.\d+)?)%", css):
        out.append((float(m.group(1)), float(m.group(2)) / 100, float(m.group(3)) / 100))
    return out

def radii(css, markup):
    vals = []
    for m in re.finditer(r"border-radius:\s*([\d.]+)(px|rem|em)", css):
        v = float(m.group(1)) * (16 if m.group(2) != "px" else 1); vals.append(v)
    for m in re.finditer(r"border-radius:\s*(50%|9999px|999px)", css): vals.append(9999)
    for m in re.finditer(r"\brounded(?:-(none|sm|md|lg|xl|2xl|3xl|full))?\b(?!-[a-z]{1,2}\b)", markup):
        vals.append(TW_RADIUS.get(m.group(1) or "", 4))
    return vals

def split(texts):
    # exclude stock shadcn primitives: they ship with animate-in/shadow-lg/backdrop-blur regardless of the design
    texts = {p: t for p, t in texts.items() if not re.search(r"(^|/)components/ui/", p)}
    css = "\n".join(t for p, t in texts.items() if p.endswith(STYLE))
    markup = "\n".join(t for p, t in texts.items() if p.endswith(MARKUP) and not p.endswith(("package.json",)))
    # <style> blocks inside html/vue count as css
    for p, t in texts.items():
        if p.endswith((".html", ".htm", ".vue", ".svelte")):
            css += "\n" + "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", t, re.S | re.I))
    cfg = "\n".join(t for p, t in texts.items() if p.endswith(("tailwind.config.ts", "tailwind.config.js", "package.json", "components.json")))
    return css, markup, cfg

def feats(texts):
    css, markup, cfg = split(texts)
    texts = {p: t for p, t in texts.items() if not re.search(r"(^|/)components/ui/", p)}
    allt = css + "\n" + markup
    cols = colors_in(css + "\n" + markup)
    sat_cols = [c for c in cols if c[1] >= 0.25 and 0.12 <= c[2] <= 0.9]
    purple_cols = [c for c in sat_cols if 255 <= c[0] <= 300]
    rad = radii(css, markup)
    big = sum(1 for v in rad if v >= 12) / len(rad) if rad else 0
    kb = max(1, len(allt) / 1000)
    n = lambda pat, t=allt, fl=0: len(re.findall(pat, t, fl))
    fam = set()
    for m in re.finditer(r"font-family:\s*([^;}{]+)", css): fam.add(m.group(1).split(",")[0].strip(" '\"").lower())
    for m in re.finditer(r"family=([A-Za-z+]+)", allt): fam.add(m.group(1).replace("+", " ").lower())
    fam = {f for f in fam if f and f not in ("inherit", "initial", "sans-serif", "serif", "monospace", "system-ui", "var(--font-sans)") and not f.startswith(("var(", "-apple", "ui-"))}
    md = [t for p, t in texts.items() if p.endswith(MARKUP)]
    return {
        # --- typography
        "inter_font": bool(re.search(r"font-family:[^;}]*\binter\b|fontsource/inter|family=Inter|fontFamily[^}]{0,80}Inter|next/font/google[^;]*Inter", allt, re.I) or re.search(r"\bInter\b[^\n]{0,30}sans-serif", allt)),
        "serif_display": bool(re.search(r"playfair|fraunces|instrument serif|cormorant|dm serif|lora\b|libre baskerville|newsreader|source serif|crimson", allt, re.I)),
        "uppercase_tracking": n(r"uppercase[^\"'`\n]{0,70}tracking-(?:wide|wider|widest)|tracking-(?:wide|wider|widest)[^\"'`\n]{0,70}uppercase") >= 1 or bool(re.search(r"text-transform:\s*uppercase[^}]{0,120}letter-spacing|letter-spacing[^}]{0,120}text-transform:\s*uppercase", css)),
        "many_fonts_3plus": len(fam) >= 3,
        # --- colour
        "purple_palette": n(r"(?:bg|text|border|from|via|to|ring|shadow)-(?:purple|violet|indigo|fuchsia)-\d{2,3}") >= 2 or len(purple_cols) >= 3,
        "gradient_bg": n(r"bg-gradient-to-|bg-linear-to-|linear-gradient\(|radial-gradient\(") >= 2,
        "gradient_text": bool(re.search(r"bg-clip-text|background-clip:\s*text", allt)),
        "gradient_multi_hue": n(r"(?:from|via|to)-(?:purple|violet|indigo|blue|pink|fuchsia|cyan|teal|emerald|rose|orange)-\d{2,3}") >= 3 or n(r"linear-gradient\([^)]*#[0-9a-f]{3,6}[^)]*#[0-9a-f]{3,6}", css, re.I) >= 2,
        "blurred_glow_orbs": bool(re.search(r"blur-3xl|blur-2xl|blur-\[\d{2,3}px\]|filter:\s*blur\(\s*\d{2,3}px", allt)),
        "glassmorphism": bool(re.search(r"backdrop-blur|backdrop-filter", allt)),
        "shadcn_hsl_tokens": bool(re.search(r"--primary:", css) and re.search(r"--(?:background|foreground|muted-foreground|card-foreground)", css)),
        "colour_variety_high": len({round(c[0] / 30) for c in sat_cols}) >= 6,
        # --- shape / surface
        "big_rounded_majority": big >= 0.5 and len(rad) >= 5,
        "pill_badges": n(r"rounded-full[^\"'`\n]{0,60}(?:px-[2-4]|py-1)[^\"'`\n]{0,60}text-(?:xs|sm)|border-radius:\s*(?:999|9999)px") >= 2,
        "soft_big_shadows": n(r"shadow-(?:lg|xl|2xl)|box-shadow:\s*0\s+(?:4|8|10|12|20|25)px\s+\d{2}px") >= 3,
        "hover_lift_scale": n(r"hover:(?:-translate-y|scale-1)|hover:shadow-") >= 2 or bool(re.search(r":hover[^}]{0,120}transform:\s*(?:translateY\(-|scale\()", css)),
        "transition_everywhere": n(r"transition-all|transition:\s*all") >= 3,
        "left_border_accent": bool(re.search(r"border-l-[2-8]\b|border-left:\s*[3-6]px\s+solid", allt)),
        "fade_in_animations": bool(re.search(r"animate-fade-in|animate-in\b|fade-in|animate-slide|framer-motion|animate-pulse|animate-bounce", allt)),
        # --- layout / content patterns
        "center_aligned_heavy": n(r"text-center|text-align:\s*center") >= 8,
        "three_col_feature_grid": bool(re.search(r"grid-cols-3|repeat\(3,\s*1fr|repeat\(3,\s*minmax", allt)),
        "emoji_in_ui": len(EMOJI.findall("\n".join(md))) >= 2,
        "marketing_buzzwords": len(BUZZ.findall("\n".join(md))) >= 3,
        "em_dashes_in_copy": ("\n".join(md)).count("—") >= 3,
        "stat_counters_row": bool(re.search(r">\s*\d{1,3}(?:[.,]\d+)?\s*(?:\+|%|[KkMm]\+?|/7)\s*<", "\n".join(md))) and n(r"text-(?:3|4|5)xl[^\"'`\n]{0,40}font-(?:bold|extrabold)") >= 2,
        "lorem_ipsum": bool(re.search(r"lorem ipsum", allt, re.I)),
        # --- tooling fingerprints (reported, NOT used in the visual score)
        "t_shadcn_ui": bool(re.search(r"components\.json|@/components/ui|class-variance-authority", allt + cfg)),
        "t_lucide": bool(re.search(r"lucide(?:-react)?", allt + cfg)),
        "t_radix": "@radix-ui" in cfg + allt,
        "t_framer_motion": "framer-motion" in cfg + allt,
        "t_tailwind": bool(re.search(r"tailwindcss|tailwind\.config", cfg + allt)),
        "t_bootstrap": bool(re.search(r"bootstrap", allt, re.I)),
        "t_jquery": bool(re.search(r"jquery", allt, re.I)),
        # --- numbers
        "n_fonts": len(fam), "n_radius_big_share": round(big, 3), "kb": round(kb),
    }

def fisher(a, b, c, d):
    """two-sided Fisher exact p for [[a,b],[c,d]] (a,b = group1 yes/no; c,d = group2 yes/no)"""
    r1, r2, c1, n = a + b, c + d, a + c, a + b + c + d
    def lp(x): return math.lgamma(r1 + 1) + math.lgamma(r2 + 1) + math.lgamma(c1 + 1) + math.lgamma(n - c1 + 1) - math.lgamma(n + 1) - math.lgamma(x + 1) - math.lgamma(r1 - x + 1) - math.lgamma(c1 - x + 1) - math.lgamma(r2 - c1 + x + 1)
    lo, hi = max(0, c1 - r2), min(r1, c1)
    p0 = lp(a); tot = 0.0
    for x in range(lo, hi + 1):
        if lp(x) <= p0 + 1e-9: tot += math.exp(lp(x))
    return min(1.0, tot)

def load(label): return json.load(open(f"{SC}/corpus/{label}.json"))

if __name__ == "__main__":
    ai, hu = load("ai"), load("human")
    F = {"ai": [feats(r["files"]) for r in ai], "human": [feats(r["files"]) for r in hu]}
    for r, f in zip(ai, F["ai"]): f["_group"], f["_repo"] = r["group"], r["repo"]
    for r, f in zip(hu, F["human"]): f["_group"], f["_repo"] = r["group"], r["repo"]
    json.dump(F, open("features.json", "w"), indent=0)
    print("n:", {k: len(v) for k, v in F.items()}, "| human tailwind:", sum(f["_group"].startswith("tailwind") for f in F["human"]))
