# Running bracketology in a local Claude session

Why local: the weekly edition is written by Claude, then **published by committing files to this repo and pushing**. A local
session (Claude Code or the Claude desktop app opened on this folder) can do all of that with your own GitHub login, and it
can read the export straight from your Downloads folder, so you don't have to attach anything.

## One-time setup (about 10 minutes)
1. **Install Node.js** (version 18 or newer) from nodejs.org. Nothing else to install: the tools have no dependencies.
2. **Install Git** if you don't have it, and make sure you can push to GitHub from your computer (GitHub Desktop, or `gh auth login`).
3. **Get the project folder.** In a terminal:
   ```bash
   cd ~/Documents            # or wherever you keep things (this is your "Hardwood" folder)
   git clone https://github.com/jbandre0/hardwood
   ```
   If you already have the folder as a clone, run `git pull` in it instead.
4. **Open Claude on that folder**: Claude Code (`cd hardwood && claude`) or the Claude desktop app, choosing the folder.
   Claude reads `CLAUDE.md` and the bracketology skill automatically.
5. *(Optional, makes the weekly step zero-effort)* In Chrome, on the Commissioner desk, choose the backup folder, or just keep
   your downloads in the default Downloads folder. `node tools/latest_export.mjs` finds the newest export in `exports/`,
   Downloads or Desktop.

## Every week
1. On the site: **Commissioner desk > Export for bracketology** (also on the Bracketology page). A file named
   `hardwood-season-2-through-day-<N>.json` lands in Downloads.
2. Open Claude in the project folder and say: **"do bracketology"**.
3. Claude pulls the latest code, finds your export, reads the season, builds the field, writes the article, validates it,
   publishes it, saves the weekly backup, commits and pushes. About a minute later the edition is live on the site.
4. Claude tells you the headline, the four 1 seeds, who moved, and where to look.

Run it after each "week" of the season (every third day: weeks end after days 3, 6, 9, ... 42), plus once after the
conference tournaments and once after the NCAA tournament. After day 47, when you have built the NCAA field on the
Commissioner desk and **before** playing day 48, say "do bracketology and file Bracketology HQ's bracket challenge".

## If something goes wrong
| Problem | Fix |
|---|---|
| "No export found" | Export again from the site, or drag the file into the `exports/` folder in the project. |
| The export is older than the last edition | You haven't played new days since the last edition. Play the next days, export again. |
| Publisher says NOT PUBLISHED | Read its list (unknown team name, two automatic bids in a conference, an em dash, a short field). Claude fixes the draft and re-runs it. |
| Push is rejected | Someone (or another session) pushed first. Run `git pull --rebase`, then push again. |
| You want to redo a week | Say "redo week N": Claude uses `--replace`, which overwrites that week's published edition. |
| Nothing shows on the site | The deploy takes about a minute after the push. Check the Actions tab on GitHub for a green run, then hard-refresh the page. |

## What lives where
- Your games and everything you do on the site: **your browser** (back it up: Commissioner desk, automatic backup folder).
- Published editions: `data/editions.json`. Bracket challenge entry: `data/challenge.json`. Weekly backup copy of your browser data: `data/backups/latest.json`. These are public on GitHub (it's fantasy league data).
- Exports you download: `exports/` is git-ignored, so they never get committed.
