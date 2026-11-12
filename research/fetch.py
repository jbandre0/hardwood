#!/usr/bin/env python3
"""Phase 2: sample repos (seeded), verify AI fingerprints, crawl front-end source via raw.githubusercontent.com.
(The repo-tree API is not available for third-party repos from this container, so we start from standard
paths and follow <link>/<script>/import references.) Third-party code is only read as text and pattern-counted,
never executed. The downloaded corpus is NOT committed."""
import json, os, random, re, sys, time, posixpath, urllib.request, urllib.parse, concurrent.futures as cf
SC = "/tmp/claude-0/-home-user/07521494-4e74-5e21-b355-190f54e0e9fd/scratchpad/study"
os.makedirs(SC + "/corpus", exist_ok=True)
pools = json.load(open("pools.json"))
random.seed(20261112)

def raw(repo, br, path, tries=2):
    u = f"https://raw.githubusercontent.com/{repo}/{urllib.parse.quote(br)}/{urllib.parse.quote(path)}"
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "research-script"}), timeout=25) as r:
                b = r.read(400_000)
                return b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 403, 400): return None
        except Exception:
            pass
        time.sleep(1 + i)
    return None

HTML_SEEDS = ["index.html", "public/index.html", "src/index.html", "docs/index.html", "dist/index.html"]
CSS_SEEDS = ["style.css", "styles.css", "css/style.css", "css/styles.css", "css/main.css", "main.css", "assets/css/style.css",
             "assets/css/main.css", "assets/style.css", "public/style.css", "src/index.css", "src/App.css", "src/styles/index.css",
             "src/style.css", "src/styles.css", "src/main.css", "src/assets/main.css", "src/assets/css/main.css", "app/globals.css",
             "styles/globals.css", "src/app/globals.css", "src/styles/globals.css", "src/styles/main.css", "static/css/style.css"]
CFG_SEEDS = ["tailwind.config.ts", "tailwind.config.js", "components.json", "package.json"]
APP_SEEDS = ["src/App.tsx", "src/App.jsx", "src/App.vue", "src/main.tsx", "src/pages/Index.tsx", "src/pages/Home.tsx", "src/pages/index.tsx",
             "app/page.tsx", "app/layout.tsx", "src/app/page.tsx", "src/app/layout.tsx", "pages/index.tsx", "pages/index.js",
             "src/components/Hero.tsx", "src/components/HeroSection.tsx", "src/components/Header.tsx", "src/components/Navbar.tsx",
             "src/components/Navigation.tsx", "src/components/Footer.tsx", "src/components/Features.tsx", "components/hero.tsx",
             "components/header.tsx", "components/features.tsx", "components/navbar.tsx", "components/footer.tsx",
             "src/components/Layout.tsx", "src/components/Dashboard.tsx", "src/pages/Dashboard.tsx", "src/pages/Landing.tsx"]
VENDOR = re.compile(r"(node_modules|\.min\.|bootstrap|jquery|font-?awesome|fontawesome|normalize|animate\.css|owl\.|slick|swiper|fancybox|magnific|aos\.|popper|isotope|select2|datatables|/vendor/|/lib/)", re.I)
CODE_EXT = (".tsx", ".jsx", ".vue", ".svelte", ".ts", ".js")

def resolve(base, ref):
    if re.match(r"^(https?:)?//|^data:|^#|^mailto:", ref): return []
    ref = ref.split("?")[0].split("#")[0]
    if not ref: return []
    p = posixpath.normpath(posixpath.join(posixpath.dirname(base), ref)) if not ref.startswith("/") else ref.lstrip("/")
    if ref.startswith("@/"): p = "src/" + ref[2:]
    if p.startswith("../"): return []
    return [p]

def js_candidates(base, ref):
    if ref.startswith("@/"): stem = "src/" + ref[2:]
    elif ref.startswith("."): stem = posixpath.normpath(posixpath.join(posixpath.dirname(base), ref))
    else: return []
    if stem.endswith((".css", ".scss")): return [stem]
    if stem.endswith(CODE_EXT): return [stem]
    return [stem + e for e in (".tsx", ".jsx", ".vue", ".ts", ".js")] + [stem + "/index" + e for e in (".tsx", ".jsx")]

def crawl(c):
    repo, br = c["repo"], c["branch"]
    texts, tried, q = {}, set(), []
    def get(p):
        if p in tried or VENDOR.search(p): return
        tried.add(p)
        t = raw(repo, br, p, tries=1 if p in SEEDALL else 2)
        if t: texts[p] = t; q.append(p)
    SEEDALL = set(HTML_SEEDS + CSS_SEEDS + CFG_SEEDS + APP_SEEDS)
    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(get, HTML_SEEDS + CSS_SEEDS + CFG_SEEDS + APP_SEEDS))
    # follow references (2 rounds)
    for rnd in range(2):
        nxt = []
        for p in list(q):
            t = texts[p]
            refs = []
            if p.endswith((".html", ".htm")):
                refs += [x for r in re.findall(r"""<link[^>]+href=["']([^"']+\.css[^"']*)["']""", t, re.I) for x in resolve(p, r)]
                refs += [x for r in re.findall(r"""<script[^>]+src=["']([^"']+\.(?:js|tsx?|jsx)[^"']*)["']""", t, re.I) for x in resolve(p, r)][:6]
            elif p.endswith(CODE_EXT):
                for r in re.findall(r"""(?:from|import)\s*\(?\s*["']([^"']+)["']""", t):
                    refs += js_candidates(p, r)
            elif p.endswith((".css", ".scss")):
                refs += [x for r in re.findall(r"""@import\s+(?:url\()?["']?([^"')]+)""", t) for x in resolve(p, r)]
            nxt += refs
        q = []
        todo = [p for p in dict.fromkeys(nxt) if p not in tried and not VENDOR.search(p)][:40]
        if sum(map(len, texts.values())) > 700_000 or len(texts) > 45: break
        # for import stems we try the first candidate that exists
        with cf.ThreadPoolExecutor(8) as ex:
            list(ex.map(get, todo))
    code = {p: t for p, t in texts.items() if p.endswith((".html", ".htm", ".css", ".scss", ".tsx", ".jsx", ".vue", ".svelte"))}
    return texts, code

def fingerprint_ok(c, texts):
    src = c["src"]
    if src.startswith("lovable"): return True
    pkg = texts.get("package.json", "")
    if src.startswith("v0"): return "components.json" in texts
    if src.startswith("bolt"): return "vite-react-typescript-starter" in pkg or raw(c["repo"], c["branch"], ".bolt/config.json") is not None
    return True

def process(c):
    try:
        texts, code = crawl(c)
    except Exception as e:
        return ("fail", c)
    tot = sum(len(t) for t in code.values())
    if len(code) < 2 or tot < 4000: return ("small", c)
    if not fingerprint_ok(c, texts): return ("nofp", c)
    return ("ok", dict(c, files=texts))

def run(label, quotas):
    got, stats = [], {"nofp": 0, "small": 0, "fail": 0}
    for name, (match, n) in quotas.items():
        cands = [c for c in pools[label] if match(c)]
        random.shuffle(cands)
        have, i = [], 0
        with cf.ThreadPoolExecutor(10) as ex:
            while len(have) < n and i < len(cands):
                batch = cands[i:i + 20]; i += 20
                for r in ex.map(process, batch):
                    if r[0] == "ok" and len(have) < n: have.append(r[1])
                    elif r[0] != "ok": stats[r[0]] += 1
                print(f"  {label}/{name}: {len(have)}/{n} after {i} scanned", flush=True)
        for h in have: h["group"] = name
        got += have
    return got, stats

ai_q = {"lovable": (lambda c: c["src"].startswith("lovable"), 50), "v0": (lambda c: c["src"].startswith("v0"), 20),
        "bolt": (lambda c: c["src"].startswith("bolt"), 15), "vibe": (lambda c: c["src"] == "vibe", 15)}
human_q = {"tailwind-pre2021": (lambda c: c["src"].startswith("tailwind"), 35), "plain-pre2021": (lambda c: not c["src"].startswith("tailwind"), 65)}
t0 = time.time()
for label, q in (("ai", ai_q), ("human", human_q)):
    got, stats = run(label, q)
    json.dump(got, open(f"{SC}/corpus/{label}.json", "w"))
    print(label, "TOTAL", len(got), "rejected", stats, f"{time.time()-t0:.0f}s", flush=True)
