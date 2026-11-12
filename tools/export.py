#!/usr/bin/env python3
"""Export the Hardwood Sim workbook to static JSON for the website.

Usage:  python3 -I tools/export.py /path/to/workbook.xlsm

Reads cached cell values only (no macros are run). Writes to data/ and
tools/fixtures/. Re-run after every season or whenever the workbook changes.
"""
import json, os, re, sys, warnings
import openpyxl

warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FIX = os.path.join(ROOT, "tools", "fixtures")
os.makedirs(DATA, exist_ok=True)
os.makedirs(FIX, exist_ok=True)


def slug(s):
    s = s.lower().replace("&", "and").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def rnd(v, n=3):
    return round(v, n) if isinstance(v, float) else v


def table(wb, sheet, header_row, first_col=1):
    """Return (headers, rows) for a sheet whose header sits on header_row."""
    ws = wb[sheet]
    it = ws.iter_rows(min_row=header_row, values_only=True)
    hdr = list(next(it))[first_col - 1:]
    # trim trailing Nones
    while hdr and hdr[-1] is None:
        hdr.pop()
    rows = []
    for r in it:
        r = list(r)[first_col - 1:first_col - 1 + len(hdr)]
        if r and r[0] is None:
            break
        rows.append(r)
    return hdr, rows


def main(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)

    # ---------- engine inputs (Sim Live) ----------
    sh, srows = table(wb, "Sim Live", 4, 2)  # starts in column B
    ENG_COLS = sh[:26]
    inputs = {r[0]: [rnd(x, 4) if isinstance(x, float) else x for x in r[:26]] for r in srows}

    # ---------- team stats ----------
    th, trows = table(wb, "Team Stats", 4, 2)
    ti = {h: i for i, h in enumerate(th)}
    teams = []
    for r in sorted(trows, key=lambda r: r[0]):
        name = r[0]
        g = lambda k: r[ti[k]]
        teams.append(dict(
            id=len(teams), slug=slug(name), name=name, conf=g("Conference"), tier=g("Tier"),
            gp=g("GP"), w=g("W"), l=g("L"), cw=g("Conf W"), cl=g("Conf L"),
            home=g("Home"), away=g("Away"), neutral=g("Neutral"),
            pf=rnd(g("PF/G"), 2), pa=rnd(g("PA/G"), 2), margin=rnd(g("Margin/G"), 2),
            oppRating=rnd(g("Opp Rating"), 2), rating=rnd(g("Rating"), 2),
            tierRating=rnd(g("Tier Rating"), 2), rank=g("Rank"),
            last10=g("Last 10"), streak=g("Streak"),
            bestWin=g("Best Win"), worstLoss=g("Worst Loss"),
            eng=inputs[name],
        ))
    tid = {t["name"]: t["id"] for t in teams}
    assert len(teams) == 365, len(teams)

    # ---------- schedule ----------
    _, grows = table(wb, "Schedule", 5, 2)
    games = []
    for r in grows:
        gid, day, typ, ctx, a, b, site, _, status, pa, pb = r[:11]
        if status != "Final":
            continue
        games.append([gid, day, typ, ctx or "", tid[a], tid[b], 0 if site == "Neutral" else 1, pa, pb])
    # ---------- box scores (Game Log) ----------
    bh, brows = table(wb, "Game Log", 4, 2)
    bi = {h: i for i, h in enumerate(bh)}
    stat_cols = ["OT", "FGM A", "FGA A", "3PM A", "3PA A", "FTM A", "FTA A", "OR A", "DR A", "TO A", "ST A", "POSS A",
                 "FGM B", "FGA B", "3PM B", "3PA B", "FTM B", "FTA B", "OR B", "DR B", "TO B", "ST B", "POSS B"]
    box = []
    for r in brows:
        box.append([r[bi["Sched ID"]]] + [rnd(r[bi[c]], 1) for c in stat_cols])

    # ---------- NCAA field + article ----------
    ws = wb["March Madness"]
    field, article, headline = [], None, None
    for i, row in enumerate(ws.iter_rows(min_row=6, max_row=90, values_only=True)):
        reg, seed, team, ff, conf, rec = row[17], row[18], row[19], row[20], row[21], row[22]
        if team:
            field.append(dict(region=reg, seed=seed, team=tid.get(team), ff=ff, record=rec))
        if i == 0:
            headline = row[24]
        if i == 1:
            article = row[24]

    # ---------- polls ----------
    ws = wb["Poll Ballots"]
    pb = list(ws.iter_rows(min_row=5, max_row=31, min_col=2, max_col=22, values_only=True))
    weeks = []
    for c in range(1, len(pb[0])):
        wk, day = pb[0][c], pb[1][c]
        ranks = [pb[k][c] for k in range(2, 27)]
        if all(x is None for x in ranks):
            continue
        weeks.append(dict(week=wk, afterDay=day, ranks=[tid.get(x) for x in ranks]))

    # ---------- meta ----------
    champ = games[-1]
    meta = dict(
        version="v9", season="Season 1", seasonLabel="2026-27",
        champion=champ[4] if champ[7] > champ[8] else champ[5],
        runnerUp=champ[5] if champ[7] > champ[8] else champ[4],
        finalScore=[champ[7], champ[8]],
        gamesPlayed=len(games), teams=len(teams),
        article=dict(headline=headline, body=article),
        engineCols=ENG_COLS,
    )

    # ---------- real-team fixture for engine parity tests ----------
    rh, rrows = table(wb, "Teams", 4, 2)
    fixture = [[rnd(x, 4) if isinstance(x, float) else x for x in r[:26]] for r in rrows]

    def dump(name, obj, folder=DATA):
        p = os.path.join(folder, name)
        with open(p, "w") as f:
            json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
        print(f"{name:22s} {os.path.getsize(p)/1024:8.1f} KB")

    dump("teams.json", teams)
    dump("games.json", dict(cols=["id", "day", "type", "ctx", "a", "b", "home", "ptsA", "ptsB"], rows=games))
    dump("box.json", dict(cols=["id"] + stat_cols, rows=box))
    dump("ncaa.json", dict(field=field))
    dump("polls.json", weeks)
    dump("meta.json", meta)
    dump("teams-real.json", fixture, FIX)


if __name__ == "__main__":
    main(sys.argv[1])
