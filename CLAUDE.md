# Hardwood Sim: project notes for Claude

The commissioner runs a fantasy college basketball league (365 D-I teams, 31 conferences) on this static website.
Live site: GitHub Pages for this repo (deploys from `main` in about a minute). The simulation engine is possession by
possession Monte Carlo. v9 (`js/engine.js`) is **frozen**; v10 (`js/engine-v10.js`, the default since the commissioner asked for a realism ceiling) wraps it
with a strength cap, a single-stat cap and a 99% win-probability cap (1.5% "chaos" games since Season 2 day 28, 2% before; each logged game records its `chaosRate`). Any further engine change is a new version and needs the commissioner's say-so.

## The one thing to know about data
Everything the commissioner does on the site (games played, ballots, predictions, offseason choices, seasons created) is saved
**in their browser**, not in this repo. The repo only has the imported baseline (Season 1 complete, Season 2 through day 15
from Excel) plus what Claude publishes: `data/editions.json` (weekly bracketology), `data/challenge.json` (Bracketology HQ's
bracket-challenge entry) and `data/backups/latest.json` (weekly off-browser backup).
So for anything about the current season, **you need their export**: Commissioner desk (or Bracketology page) >
**Export for bracketology** downloads `hardwood-<season>-through-day-<N>.json`. Find it with `node tools/latest_export.mjs`
(looks in `exports/`, Downloads, Desktop). If there isn't one newer than the last published edition, say so and ask for it;
never write an edition from stale data.

## Weekly bracketology (the main recurring job)
When the commissioner says "do bracketology" (or similar), use the **bracketology skill**
(`.claude/skills/bracketology/SKILL.md`) and follow it exactly. In short:
1. `git pull` first. Find the export (`node tools/latest_export.mjs`), then `node tools/bracketology_brief.mjs <export> > brief.md`.
2. Read the brief and the last two editions' articles. Build the 68-team field, bubble and AP ballot, write the 1,800 to 3,000 word
   article (judgment, hot takes, patterns, callbacks; **no simulations**).
3. `node tools/publish_edition.mjs <draft> --export <export> --dry-run`, fix every error, publish, then
   `node tools/save_backup.mjs <export>`. Once the NCAA field exists (after day 47), also file the bracket challenge entry with
   `tools/publish_challenge.mjs`.
4. Commit `data/editions.json` (+ `data/backups/latest.json`, `data/challenge.json`) and `git push` to `main`.
Full local setup and troubleshooting: `docs/LOCAL-SESSION.md`.

## Rules
- **Never use em dashes** in anything written for the site (articles, notes, UI text). The publisher rejects them.
- Ask before: destructive operations (deleting data, overwriting a published week, force pushes), engine changes, licensing decisions.
- Team names are the canonical spellings in `data/league.json` ("Uconn", "St. Louis", "Miami (OH)"). Use them exactly.
- Report outcomes faithfully. If a test fails or a step was skipped, say so. Check every number you publish against the export.
- Use the strongest model available for bracketology writing (Opus); mechanical edits are fine on Sonnet.
- The commissioner likes brutal honesty, humour, no cheesiness. Articles are in the voice of "Bracketology HQ".

## Repo map
- `js/league/*.js` league logic (schedule, stats, standings, tournaments, bracketology Board, insights, offseason, history, predictions, leaders, challenge, watch); `js/engine.js` the v9 engine, `js/engine-v10.js` v10 (ceiling); `js/pages/*.js` one file per page; `*.html` the pages.
- `data/league.json` teams; `data/seasons/<id>/*.json` per-season baseline; `data/editions.json`, `data/challenge.json`, `data/backups/latest.json` published content.
- `tools/` importer (`import_workbook.py`), publishers, brief generator, test fixtures. `tests/` unit tests (`node --test tests/*.test.mjs`) and browser tests (`tests/e2e/*.cjs`).
- `README.md` has the season loop, data layout and test commands.

## Useful commands
```bash
git pull
node --test tests/*.test.mjs                 # unit tests (needs Node 18+; no installs required)
node tools/latest_export.mjs                 # newest season export
node tools/bracketology_brief.mjs <export>   # readable brief of the season for the weekly edition
node tools/publish_edition.mjs <draft.json> --export <export> --dry-run
python3 -m http.server 8000                  # run the site locally (then node tests/e2e/smoke.cjs needs Playwright)
```
