# Hardwood Sim (website)

Static site that runs the Hardwood Sim fantasy college basketball league season after season: daily game runner, ratings, standings, polls, bracketology, weekly articles, conference tournaments, the NCAA bracket, the offseason, multi-season history and a prediction tracker. The engine is a JS port of the workbook's Python engine (v9).

## Run it
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
No build step. Plain HTML, ES modules, self-hosted fonts (Barlow, Barlow Condensed).

## Refresh the data from the workbook
```bash
pip install openpyxl
python3 -I tools/import_workbook.py "/path/to/Running-Hardwood-Live.xlsm"
```
Reads cached cell values only (no macros). Writes `data/league.json`, `data/seasons/<id>/*.json`, `data/seasons/index.json` and the test fixtures in `tools/fixtures/`.

## Where data lives
- `data/seasons/<id>/` is the baseline imported from the workbook (Season 1 complete, Season 2 through day 15, the last day played in Excel).
- Everything done on the site (games played, predictions, AP ballots, Power Poll snapshots, bracketology weeks, articles, the NCAA field, offseason choices) is saved in the browser (IndexedDB, localStorage fallback) as an overlay on top of the baseline.
- Seasons created in the Offseason live in the browser too (key `base:<id>`), next to the season list (`meta:seasons`).
- Every bracketology export carries a full backup; the bracketology session saves it to `data/backups/latest.json` (git history keeps every week), and the Commissioner desk can restore it on any browser.
- **Commissioner desk, Download backup** writes all of it to one JSON file; **Restore from backup** puts it back. Back up after every session.

## The season loop
1. Commissioner desk: the Game desk loads the next scheduled game as a preview (teams, records, ranks, ratings, form, the locked prediction). Play game rolls it once and logs it to the season immediately; then Load next game. Enter does the next step. Watch game (W) shows the same game possession by possession (clock, scoreboard, play-by-play, a live win-probability estimate, runs, turning points) and logs it when it ends; Play game and Watch game use the same saved seed, so they always produce the same game, and leaving a watched game halfway cannot re-roll it. Play one game does both in one click; Play day does a whole day. Finishing a day (any of the three ways) opens that day's recap: power top 25 with the day's movement, upsets, biggest movers, notables and every result, with a button to start the next day. Every game is a single engine roll; the thousands of simulations are only for the prediction locked before it (can be switched off on the desk).
2. Rankings: cast the weekly AP ballot (a Power Poll snapshot is saved with it). Bracketology: suggest and save the weekly field. Articles: draft the weekly column from the numbers, edit, publish.
3. After day 47: Build NCAA field (conference champions get the auto-bids; the rest from the Bracketology Board), then play days 48-54.
4. Bracketology editions: Export for bracketology (Bracketology page or Commissioner desk), attach the file in a Claude session with this repo and say "do bracketology". The repo skill `.claude/skills/bracketology` reads the season (`tools/bracketology_brief.mjs`), writes the field and article, validates and publishes with `tools/publish_edition.mjs` into `data/editions.json`, and pushes to `main`. A published edition wins over anything made in the browser for that week.
5. Offseason: awards, tier review with overrides, settings, marquee games, then create the next season (a backup downloads first).

## Tests
```bash
node --test tests/*.test.mjs                 # unit tests, verified against the workbook (~66 tests)
python3 -m http.server 8000 &                # then, in another shell:
node tests/e2e/smoke.cjs                     # every page, both seasons, no console errors
node tests/e2e/runner.cjs                    # play a day, reload, undo, backup, restore
node tests/e2e/recap.cjs                     # finishing a day opens its recap
node tests/e2e/backup.cjs                    # export with backup, save to repo, restore in a new browser
node tests/e2e/watch.cjs                     # Watch mode: same game, logged once
node tests/e2e/gamedesk.cjs                  # Game desk: preview, play + log, load next with Enter
node tests/e2e/season.cjs                    # play Season 2 to a champion
node tests/e2e/lifecycle.cjs                 # ballot, column, full season, predictions, offseason, Season 3 (~6 min)
```
The browser tests use a throwaway profile; none of their fake games are kept.

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

## Logos
Team logos live in `assets/logos/` (359 of 365 teams; six newer or renamed programs use monogram badges). `data/logos.json` maps team slug to file and notes very dark or very light marks. Rebuild with `python3 tools/logo_map.py <path-to>/CBB-Team-Logos/pngs --write`. They are trademarks of their schools, used here only to identify teams in a non-commercial project; delete `assets/logos/` and `data/logos.json` to switch back to monograms.

## Design research
`research/FINDINGS.md` documents the AI-vs-human design-pattern study that shaped the visual design.

## Not built yet
Prediction tracker for real-world 2026-27 games (the tracker scores the sim's own games), live play-by-play viewer for recorded games, a way to delete a season created in the browser (restore an older backup instead), conference realignment between seasons (the data model allows it; there is no editor).
