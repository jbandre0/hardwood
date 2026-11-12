# Hardwood Sim (website)

Static site for the Hardwood Sim fantasy college basketball world: Season 1 archive, matchup simulator, rankings, standings, bracket. The engine is a JS port of the workbook's Python engine (v9).

## Run it
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
No build step. Plain HTML, ES modules, self-hosted fonts (Barlow, Barlow Condensed).

## Refresh the data from the workbook
```bash
pip install openpyxl
python3 -I tools/export.py "/path/to/Hardwood-Season-1-FINAL.xlsm"
```
Reads cached cell values only (no macros). Writes `data/*.json` and `tools/fixtures/teams-real.json`.

## Test the engine
```bash
node tools/parity.mjs        # needs python3 + numpy; ~3 min
```
Runs 46 matchups through both the JS engine and `tools/ref/hoops_engine.py` (copied verbatim from the workbook's Engine Code sheet) and fails if any differ beyond sampling error.

## Layout
- `js/engine.js` the engine (pure module, works in Node and the browser)
- `js/sim-worker.js` runs 40,000 games off the main thread
- `js/data.js`, `js/ui.js` data loading + app shell; `js/pages/*.js` one file per page
- `css/app.css` design system (palette #164434 #2B7A5C #6FCF97 #FFD6A5 #FFF4E6)
- `data/` exported JSON, `tools/` exporter, reference engine, parity test

## Deploy
Any static host works (Cloudflare Pages, GitHub Pages, Netlify). Publish the repo root; there is nothing to build.

## Engine rules (from the workbook's Project Notes)
Engine constants are frozen at v9 for Season 1. Any engine change gets a new version number. Calculation notes, calibration history and known weaknesses live in the workbook's Method Write-up sheet.

## Not built yet (v2)
Prediction tracker for real 2026-27 games, polls/bracketology archive pages, live play-by-play viewer for recorded games, Season 2 offseason and history tables.
