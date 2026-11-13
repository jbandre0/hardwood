#!/usr/bin/env python3
"""Build a claude.ai-Artifact-friendly copy of the site.
The Artifact sandbox blocks stylesheets served from its own files, so CSS is inlined
and fonts come from Google Fonts. Output: <outdir>/ (supporting files) and <outdir>/../hardwood-sim-entry.html
usage: python3 tools/artifact_build.py <outdir>"""
import os, re, shutil, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = sys.argv[1]
shutil.rmtree(out, ignore_errors=True)
for d in ("js", "data", "assets"):
    shutil.copytree(os.path.join(root, d), os.path.join(out, d))
css = open(os.path.join(root, "css/app.css")).read()
GF = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Barlow:wght@400;500;600&display=swap">'
STYLE = f"{GF}\n<style>\n{css}\n</style>"
pages = ["about", "bracket", "matchup", "rankings", "standings", "team"]
for p in pages:
    h = open(os.path.join(root, p + ".html")).read()
    h = re.sub(r'<link rel="stylesheet" href="css/fonts.css">\s*<link rel="stylesheet" href="css/app.css(?:\?v=[0-9a-f]+)?">', lambda m: STYLE, h)
    assert "<style>" in h, p
    open(os.path.join(out, p + ".html"), "w").write(h)
entry = f"""<title>Hardwood Sim</title>
<meta name="claude:viewport-fit-sides" content="cover">
{STYLE}
<script>try{{var t=localStorage.getItem("hw-theme");if(t)document.documentElement.dataset.theme=t}}catch(e){{}}</script>
<script type="module" src="js/pages/home.js"></script>
"""
open(os.path.join(os.path.dirname(out), "hardwood-sim-entry.html"), "w").write(entry)
files = sorted(os.path.relpath(os.path.join(dp, f), out) for dp, _, fs in os.walk(out) for f in fs)
print("\n".join(files))
