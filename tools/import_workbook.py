#!/usr/bin/env python3
"""Import the Hardwood Sim workbook into the site's per-season data layout.

usage:  python3 tools/import_workbook.py "<path>/Running-Hardwood-Live.xlsm" [--season-label "Season 2"]

Reads cached cell values only (no macros). Never deletes existing seasons: it writes data/seasons/<id>/ for the
workbook's CURRENT season (default "Season 2") and, from the archive sheets, the closed season(s) (Season 1).
Season 1's game-by-game data is NOT in the workbook any more; the site's existing JSON is the only full copy, so this
script only adds the archive tables for Season 1 and leaves its games/box files untouched.
It also writes tools/fixtures/ with workbook-computed values used by the automated tests.
"""
import json, os, re, sys, warnings, collections
import openpyxl

warnings.filterwarnings("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
FIX = os.path.join(ROOT, "tools", "fixtures")


def slug(s):
    s = s.lower().replace("&", "and").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def r_(v, n=6):
    return round(v, n) if isinstance(v, float) else v


def iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


class WB:
    def __init__(self, path):
        self.wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
        self.cache = {}

    def rows(self, name):
        if name not in self.cache:
            rows = [[iso(v) for v in r] for r in self.wb[name].iter_rows(values_only=True)]
            while rows and all(v is None for v in rows[-1]):
                rows.pop()
            self.cache[name] = rows
        return self.cache[name]

    def table(self, name, header_key, first_col=0):
        """rows below the header row (the row containing header_key) as dicts keyed by header text"""
        rows = self.rows(name)
        hi = next(i for i, r in enumerate(rows) if r and header_key in r)
        hdr = rows[hi]
        out = []
        for r in rows[hi + 1:]:
            if not any(v is not None for v in r):
                continue
            d = {}
            for i, h in enumerate(hdr):
                if h is not None and h not in d:  # duplicate header names (e.g. two 'Week' columns): the first one wins
                    d[h] = r[i] if i < len(r) else None
            out.append(d)
        return hdr, out


def dump(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, separators=(",", ":"), ensure_ascii=False)
    print(f"  {os.path.relpath(path, ROOT):52s} {os.path.getsize(path)/1024:8.1f} KB")


ENG_COLS = ["Games", "PPG", "REB", "ST", "BL", "TO", "FT%", "3P%", "OR", "DR", "FTA", "FGA", "2P%", "OEFG%", "STR*Ra", "HFA*Ra",
            "POSS", "Opp OR/G (TR)", "Opp eFG% (TR)", "Opp 2P% (TR)", "Opp 3P% (TR)", "Opp TO% (TR)", "Opp FTA/FGA (TR)", "FTA/FGA (TR)"]
STAT_ROWS = ["PPG", "ST", "BL", "TO", "FT%", "3P%", "OR per game", "DR per game", "FTA per game", "FGA per game", "2P%", "OEFG%", "POSS",
             "Opp OR/G (TR)", "Opp eFG% (TR)", "Opp 2P% (TR)", "Opp 3P% (TR)", "Opp TO% (TR)", "Opp FTA/FGA (TR)", "FTA/FGA (TR)"]
BOX_COLS = ["OT", "FGM A", "FGA A", "3PM A", "3PA A", "FTM A", "FTA A", "OR A", "DR A", "TO A", "ST A", "POSS A",
            "FGM B", "FGA B", "3PM B", "3PA B", "FTM B", "FTA B", "OR B", "DR B", "TO B", "ST B", "POSS B"]


def main(path, season_label):
    w = WB(path)
    sid = slug(season_label)

    # ------------------------------------------------------------------ league identity (365 teams, canonical names)
    _, simteams = w.table("Sim Teams", "Team")
    simteams = [r for r in simteams if r.get("Conference")]
    names = sorted(r["Team"] for r in simteams)
    assert len(names) == 365 and len(set(names)) == 365
    tid = {n: i for i, n in enumerate(names)}
    st_by = {r["Team"]: r for r in simteams}
    league = [dict(id=tid[n], slug=slug(n), name=n, seed=int(st_by[n]["Seed"])) for n in names]
    site_teams = json.load(open(os.path.join(DATA, "teams.json"))) if os.path.exists(os.path.join(DATA, "teams.json")) else None
    if site_teams is None:  # already restructured: read the league file instead
        existing = json.load(open(os.path.join(DATA, "league.json")))
        assert [t["name"] for t in existing] == names, "team list in workbook differs from the site's league.json"
    else:
        assert [t["name"] for t in site_teams] == names, "team list in workbook differs from the site's teams.json"
    dump(os.path.join(DATA, "league.json"), league)

    # ------------------------------------------------------------------ Tier Setup (constants for the stats engine)
    ts = w.rows("Tier Setup")
    cell = lambda row, col: ts[row - 1][col - 1] if row - 1 < len(ts) and col - 1 < len(ts[row - 1]) else None  # 1-based
    settings = dict(
        ramp=cell(6, 3), anchor=cell(7, 3), basisGames=cell(8, 3), sharedWeight=cell(9, 3), rangeWidening=cell(10, 3),
        defaultTier=cell(11, 3), hfa=cell(12, 3), strAtZero=cell(13, 3), strPerSrs=cell(14, 3), spreadMult=cell(15, 3),
        convReference=cell(74, 5),
    )
    tiers = []
    for rr in range(19, 25):
        tiers.append(dict(tier=cell(rr, 2), pctLow=cell(rr, 3), pctHigh=cell(rr, 4), srsLow=cell(rr, 5), srsHigh=cell(rr, 6),
                          strLow=cell(rr, 10), strHigh=cell(rr, 11), rating=cell(rr, 13)))
    stat_ranges = []
    for rr in range(29, 49):
        mm = [cell(rr, c) for c in range(7, 19)]  # G..R = S min,max, A min,max ...
        stat_ranges.append(dict(stat=cell(rr, 2), slope=cell(rr, 3), intercept=cell(rr, 4), resSD=cell(rr, 5), rises=cell(rr, 6),
                                min=[mm[i] for i in range(0, 12, 2)], max=[mm[i] for i in range(1, 12, 2)]))
    conv = []
    for rr in range(52, 71):
        conv.append(dict(stat=cell(rr, 2), inMean=cell(rr, 3), outMean=cell(rr, 4), slope=cell(rr, 5), effect=cell(rr, 6), t=cell(rr, 7)))
    assert [c["stat"] for c in conv][:3] == ["PPG", "ST", "TO"] and len(conv) == 19, [c["stat"] for c in conv]
    assert [s["stat"] for s in stat_ranges][0] == "PPG" and len(stat_ranges) == 20

    # ------------------------------------------------------------------ Offseason settings + Tier Review + awards
    off = w.rows("Offseason")
    oc = lambda row, col: off[row - 1][col - 1] if row - 1 < len(off) and col - 1 < len(off[row - 1]) else None
    offseason_settings = dict(closedSeason=oc(6, 3), carry=oc(7, 3), fromTier=oc(8, 3), moveGap=oc(9, 3), maxMoves=oc(10, 3),
                              ramp=oc(11, 3), anchor=oc(12, 3), cinderellaMaxSeed=oc(13, 3))
    awards = []
    for rr in range(37, 51):
        if oc(rr, 2):
            awards.append(dict(award=oc(rr, 2), team=oc(rr, 3), detail=oc(rr, 4), row=oc(rr, 5)))
    conf_power = []
    for rr in range(55, 90):
        if oc(rr, 2):
            conf_power.append(dict(conf=oc(rr, 2), teams=oc(rr, 3), avgRating=r_(oc(rr, 4), 4), ncaaBids=oc(rr, 5), tourneyWins=oc(rr, 6)))
    _, tr = w.table("Tier Review", "Old Tier")
    tier_review = []
    for r in tr:
        if not r.get("Team"):
            continue
        tier_review.append(dict(team=tid[r["Team"]], oldTier=r["Old Tier"], rating=r_(r["Rating"], 4), tierRating=r_(r["Tier Rating"], 4),
                                closest=r["Closest Tier"], suggested=r["Suggested Tier"], override=r["Override"] or None, final=r["Final Tier"],
                                note=r["Note"]))
    tier_counts = collections.Counter(r["final"] for r in tier_review)

    # ------------------------------------------------------------------ Season Start (engine start lines for the new season)
    _, ss_rows = w.table("Season Start", "Final Tier")
    ss_rows = [r for r in ss_rows if r.get("Team")]
    assert len(ss_rows) == 365
    teams = []
    for n in names:
        r = next(x for x in ss_rows if x["Team"] == n)
        start = [r_(r[c], 6) for c in ENG_COLS]
        teams.append(dict(id=tid[n], conf=r["Conference"], tier=r["Final Tier"], pos=r_(r["Pos in tier"], 9), carry=r["Carry"],
                          start=start))
    # new-tier ("T ...") stats too, for tests of the generator
    tstats = {n: [r_(next(x for x in ss_rows if x["Team"] == n)["T " + c], 6) for c in ENG_COLS[1:]] for n in names}

    # ------------------------------------------------------------------ Schedule + Game Log (Season 2 so far)
    _, sched = w.table("Schedule", "Game ID")
    sched = [r for r in sched if r.get("Game ID") is not None]
    games = []
    for r in sched:
        if r["Type"] not in ("Reg", "Conf"):
            continue  # CT / NCAA slots are generated by the tournament logic, not stored here
        a, b = tid[r["Team A"]], tid[r["Team B"]]
        home = 0 if r["Site"] == "Neutral" else 1
        fin = r["Status"] == "Final"
        games.append([int(r["Game ID"]), int(r["Day"]), r["Type"], "", a, b, home, int(r["Pts A"]) if fin else None, int(r["Pts B"]) if fin else None])
    games.sort(key=lambda g: g[0])
    assert len(games) == 5475, len(games)
    _, gl = w.table("Game Log", "Game #")
    gl = [r for r in gl if r.get("Sched ID")]
    box = []
    for r in gl:
        box.append([int(r["Sched ID"])] + [r_(r[c], 3) for c in BOX_COLS])
    box.sort(key=lambda x: x[0])
    played_ids = {g[0] for g in games if g[7] is not None}
    assert played_ids == {b[0] for b in box}, "Game Log and Schedule disagree on which games are final"
    # points in the Game Log must equal points on the Schedule
    pts = {int(r["Sched ID"]): (r["Pts A"], r["Pts B"]) for r in gl}
    assert all(pts[g[0]] == (g[7], g[8]) for g in games if g[7] is not None)

    # ------------------------------------------------------------------ Marquee games
    _, mq = w.table("Marquee Games", "Visitor")
    marquee = [dict(visitor=r["Visitor"], host=r["Host"], site=r["Site"], day=r["Day (optional)"]) for r in mq if r.get("Visitor")]

    # ------------------------------------------------------------------ polls + bracketology for the current season
    pb = w.rows("Poll Ballots")
    ballots = []
    for c in range(2, len(pb[4])):
        wk = pb[4][c]
        if wk is None:
            continue
        ranks = [pb[6 + k][c] for k in range(25)]
        if any(ranks):
            ballots.append(dict(week=wk, afterDay=pb[5][c], ranks=[tid[x] if x else None for x in ranks]))
    pp = w.rows("Power Poll")
    power = []
    hdr_i = next((i for i, r in enumerate(pp) if r and "After day" in r), None)
    if hdr_i is not None:
        wk_row = [r for r in pp if r and r[1] == "Week"]
    _, bl = w.table("Bracketology Log", "Group")
    bl = [r for r in bl if r.get("Team")]
    picks = [dict(week=r["Week"], group=r["Group"], team=tid[r["Team"]], seed=r["Seed"], region=r["Region"], bid=r["Bid"], ff=r["FF Game"],
                  bubble=r["Bubble Rank"], note=r["Note"]) for r in bl]
    arts = {}
    for r in w.table("Bracketology Log", "Headline")[1]:
        if r.get("Headline") and r.get("Article") is not None:
            wk = r.get("Week")
            arts[(r["Headline"])] = dict(week=wk, headline=r["Headline"], body=r["Article"])
    # the article table sits beside the picks and repeats the 'Week' header; read it by position instead
    rows_bl = w.rows("Bracketology Log")
    hi = next(i for i, r in enumerate(rows_bl) if r and "Headline" in r)
    h = rows_bl[hi]
    wi = [i for i, x in enumerate(h) if x == "Week"][-1]
    hl, ar = h.index("Headline"), h.index("Article")
    articles = []
    for r in rows_bl[hi + 1:]:
        if len(r) > ar and r[hl] and r[ar]:
            articles.append(dict(week=r[wi], headline=r[hl], body=r[ar]))
    # committee adjustments (CommAdj) + board settings
    brd = w.rows("Bracketology Board")
    bs = lambda row, col: brd[row - 1][col - 1] if row - 1 < len(brd) and col - 1 < len(brd[row - 1]) else None
    board_settings = dict(week=bs(4, 3), throughDay=bs(5, 3), q1Rank=bs(6, 3), q2Rank=bs(7, 3), badLossRank=bs(8, 3), winWeight=bs(9, 3),
                          q1Pts=bs(10, 3), q2Pts=bs(11, 3), badLossPts=bs(12, 3), atLarge=bs(13, 3), seedBump=bs(14, 3))
    hi = next(i for i, r in enumerate(brd) if r and "Reason" in r)
    h = brd[hi]
    ci = h.index("Reason")
    comm_adj = []
    for r in brd[hi + 1:]:
        if len(r) > ci and r[ci - 2] is not None and r[ci - 1] is not None and r[ci - 3] is not None:
            comm_adj.append(dict(week=r[ci - 3], team=tid[r[ci - 2]] if r[ci - 2] in tid else r[ci - 2], adj=r[ci - 1], reason=r[ci]))

    # ------------------------------------------------------------------ Season 1 archive (only the tables; games stay as imported before)
    def archive_for(label):
        out = {}
        _, t = w.table("Titles", "Champion"); out["titles"] = [x for x in t if x.get("Season") == label]
        _, t = w.table("MM Results", "Result"); out["mmResults"] = [x for x in t if x.get("Season") == label]
        _, t = w.table("MM Games", "Game ID"); out["mmGames"] = [x for x in t if x.get("Season") == label]
        _, t = w.table("Season Stats", "Team"); out["seasonStats"] = [x for x in t if x.get("Season") == label]
        _, t = w.table("Season Articles", "Heading"); out["articles"] = [x for x in t if x.get("Season") == label]
        _, t = w.table("Poll History", "Rank"); out["pollHistory"] = [x for x in t if x.get("Season") == label]
        _, t = w.table("Bracket History", "Group"); out["bracketHistory"] = [x for x in t if x.get("Season") == label]
        return out

    closed = offseason_settings["closedSeason"]
    arch = archive_for(closed)
    for k, v in arch.items():
        for row in v:
            for kk in list(row):
                if isinstance(row[kk], float):
                    row[kk] = r_(row[kk], 6)
            for fld in ("Team", "Loser", "Winner", "Team A", "Team B"):
                if row.get(fld) in tid:
                    row[fld + " id"] = tid[row[fld]]

    # ------------------------------------------------------------------ write files
    print("writing", sid)
    sd = os.path.join(DATA, "seasons", sid)
    dump(os.path.join(sd, "teams.json"), teams)
    dump(os.path.join(sd, "games.json"), dict(cols=["id", "day", "type", "ctx", "a", "b", "home", "ptsA", "ptsB"], rows=games))
    dump(os.path.join(sd, "box.json"), dict(cols=["id"] + BOX_COLS, rows=box))
    dump(os.path.join(sd, "settings.json"), dict(settings=settings, tiers=tiers, statRanges=stat_ranges, conversion=conv, engCols=ENG_COLS,
                                                  tierCounts=dict(tier_counts)))
    dump(os.path.join(DATA, "seasons", slug(offseason_settings["closedSeason"]), "settings.json"),   # the closed season used the same Tier Setup constants
         dict(settings=settings, tiers=tiers, statRanges=stat_ranges, conversion=conv, engCols=ENG_COLS, tierCounts=dict(collections.Counter(t["oldTier"] for t in tier_review)), inheritedFrom=sid))
    dump(os.path.join(sd, "marquee.json"), marquee)
    dump(os.path.join(sd, "polls.json"), dict(ap=ballots, power=power))
    dump(os.path.join(sd, "bracketology.json"), dict(settings=board_settings, picks=picks, articles=articles, commAdj=comm_adj))
    dump(os.path.join(sd, "offseason.json"), dict(settings=offseason_settings, awards=awards, confPower=conf_power, tierReview=tier_review, closedSeason=closed))
    played = sum(1 for g in games if g[7] is not None)
    maxday = max(g[1] for g in games if g[7] is not None)
    cs = slug(closed)
    dump(os.path.join(DATA, "seasons", cs, "archive.json"), arch)
    # the closed season's final engine lines come from the archive's full-precision 'Eng' columns (BL and HFA*Ra are not recorded, so keep the tier values)
    ct = os.path.join(DATA, "seasons", cs, "teams.json")
    if os.path.exists(ct):
        cteams = json.load(open(ct)); byid = {r["Team id"]: r for r in arch["seasonStats"] if "Team id" in r}
        eng_names = {"PPG": "Eng PPG", "REB": "Eng REB", "ST": "Eng ST", "TO": "Eng TO", "FT%": "Eng FT%", "3P%": "Eng 3P%", "OR": "Eng OR", "DR": "Eng DR",
                     "FTA": "Eng FTA", "FGA": "Eng FGA", "2P%": "Eng 2P%", "OEFG%": "Eng OEFG%", "STR*Ra": "Eng STR*Ra", "POSS": "Eng POSS",
                     "Opp OR/G (TR)": "Eng Opp OR/G (TR)", "Opp eFG% (TR)": "Eng Opp eFG% (TR)", "Opp 2P% (TR)": "Eng Opp 2P% (TR)", "Opp 3P% (TR)": "Eng Opp 3P% (TR)",
                     "Opp TO% (TR)": "Eng Opp TO% (TR)", "Opp FTA/FGA (TR)": "Eng Opp FTA/FGA (TR)", "FTA/FGA (TR)": "Eng FTA/FGA (TR)"}
        for t in cteams:
            row = byid[t["id"]]
            fin = list(t["final"])
            for name, col in eng_names.items():
                fin[ENG_COLS.index(name)] = r_(row[col], 6)
            t["final"] = fin
        dump(ct, cteams)
    index_path = os.path.join(DATA, "seasons", "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else []
    keep = {x["id"]: x for x in index}
    keep[cs] = dict(id=cs, label=closed, status="complete", **{k: keep.get(cs, {}).get(k) for k in () })
    keep[sid] = dict(id=sid, label=season_label, status="in-progress", seed=dict(conference=52719643, nonConference=52719644))
    order = sorted(keep.values(), key=lambda x: int(re.sub(r"\D", "", x["id"]) or 0))
    dump(index_path, order)
    dump(os.path.join(sd, "meta.json"), dict(id=sid, label=season_label, version="v9", importedFrom=os.path.basename(path), playedGames=played,
                                               lastPlayedDay=maxday, scheduledGames=len(games), ballotsWeeks=[b["week"] for b in ballots]))

    # ------------------------------------------------------------------ fixtures: workbook-computed values the tests compare against
    print("writing test fixtures")
    _, sim_season = w.table("Sim Season", "SRS")
    _, team_stats = w.table("Team Stats", "Rating")
    _, sim_live = w.table("Sim Live", "Weight w")
    _, standings_src = w.table("Power Ratings", "Rating")
    fx = dict(
        simSeason={r["Team"]: {k: r_(v, 9) for k, v in r.items() if k and isinstance(v, (int, float))} for r in sim_season if r.get("Team") in tid},
        teamStats={r["Team"]: {k: (r_(v, 9) if isinstance(v, float) else v) for k, v in r.items() if k and k != "Conference list"} for r in team_stats if r.get("Team") in tid},
        simLive={r["Team"]: [r_(r[c], 9) for c in ["Games", "PPG", "REB", "ST", "BL", "TO", "FT%", "3P%", "OR", "DR", "FTA", "FGA", "2P%", "OEFG%", "STR*Ra", "HFA*Ra", "POSS", "Opp OR/G (TR)", "Opp eFG% (TR)", "Opp 2P% (TR)", "Opp 3P% (TR)", "Opp TO% (TR)", "Opp FTA/FGA (TR)", "FTA/FGA (TR)"]] for r in sim_live if r.get("Team") in tid},
        newTierStats=tstats,
        tierRatingsCentered=[r_(cell(rr, 14), 9) for rr in range(19, 25)],
    )
    # Standings sheet: the selected conference's order, and the conference power table underneath it
    st_rows = w.rows("Standings")
    conf_sel = next(r[2] for r in st_rows if r and r[1] == "Conference" and r[2])
    hi = next(i for i, r in enumerate(st_rows) if r and r[1] == "Rank")
    order = []
    for r in st_rows[hi + 1:]:
        if r[1] is None or not isinstance(r[1], (int, float)): break
        order.append(r[2])
    pi = next(i for i, r in enumerate(st_rows) if r and r[1] == "Conference" and r[2] == "Teams")
    power = []
    for r in st_rows[pi + 1:]:
        if not r[1] or not isinstance(r[2], (int, float)) or r[7] is None: break
        power.append(dict(conf=r[1], teams=r[2], ncW=r[3], ncL=r[4], ncPct=r_(r[5], 9), avgRating=r_(r[6], 9), avgTier=r_(r[7], 9), rank=r[8]))
    fx["standings"] = dict(conf=conf_sel, order=order, power=power)
    dump(os.path.join(FIX, "season2-workbook-expected.json"), fx)
    # calibration log (1,000 frozen avg-vs-avg games) for box-score distribution tests
    _, cal = w.table("Calibration Log", "Engine POSS")
    cal = [[r["Game"], r["Slot"], r["PTS"], r["FGA"], r["FGM"], r["3PA"], r["3PM"], r["2PA"], r["2PM"], r["FTA"], r["FTM"], r["TO"], r["ST"], r["OR"], r["DR"], r["OT"]] for r in cal if r.get("Slot")]
    dump(os.path.join(FIX, "calibration-log.json"), dict(cols=["Game", "Slot", "PTS", "FGA", "FGM", "3PA", "3PM", "2PA", "2PM", "FTA", "FTM", "TO", "ST", "OR", "DR", "OT"], rows=cal))
    import subprocess
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_index.py")], check=True, stdout=subprocess.DEVNULL)   # keep the season file manifest current
    print(f"\nSeason '{season_label}' ({sid}): {played} of {len(games)} regular-season games played, through day {maxday}; "
          f"{len(ballots)} AP ballots, {len(picks)} bracketology picks, {len(articles)} articles, {len(marquee)} marquee games.")
    print(f"Archive for closed season '{closed}': " + ", ".join(f"{k}={len(v)}" for k, v in arch.items()))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    label = "Season 2"
    if "--season-label" in sys.argv:
        label = sys.argv[sys.argv.index("--season-label") + 1]
        args = [a for a in args if a != label]
    main(args[0], label)
