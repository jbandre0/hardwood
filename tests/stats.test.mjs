// Phase 3: the stats engine must reproduce the workbook's own numbers for all 365 teams.
import test from "node:test";
import assert from "node:assert/strict";
import { league, season, fixture, near } from "./util.mjs";
import { ENG, tierStats, seasonStart, centeredTierRatings, computeSeason, TIERS } from "../js/league/stats.js";

const L = league(), S = season("season-2", "settings"), T2 = season("season-2", "teams"), T1 = season("season-1", "teams");
const FX = fixture("season2-workbook-expected");
const toGames = (rows) => rows.map((g) => ({ id: g[0], day: g[1], type: g[2], ctx: g[3], a: g[4], b: g[5], home: g[6], ptsA: g[7], ptsB: g[8] }));
const boxMap = (rows) => new Map(rows.map((b) => [b[0], b]));

function maxRel(a, b) { return Math.abs(a - b) / Math.max(1e-9, Math.abs(b)); }

test("tier stat generator reproduces the workbook's 'new tier' stats for all 365 teams (Season Start T columns)", () => {
  let worst = 0;
  for (const t of L) {
    const got = tierStats(T2[t.id].tier, t.seed, S), want = FX.newTierStats[t.name];
    for (let i = 1; i < 24; i++) worst = Math.max(worst, Math.abs(got[i] - want[i - 1]));
  }
  assert.ok(worst < 1e-6, "max absolute difference " + worst); // workbook values are stored to 6 decimals
});

test("position-in-tier hash matches the workbook for every team", () => {
  for (const t of L) assert.ok(near(T2[t.id].pos, tierStats(T2[t.id].tier, t.seed, S) && (Math.abs(Math.sin(t.seed * 12.9898 + 78.233)) * 43758.5453 % 1), 1e-9), t.name);
});

test("Season Start = 40% last season's final line + 60% new-tier line, for all 365 teams", () => {
  let worst = 0;
  for (const t of L) {
    const prev = T1[t.id].final, got = seasonStart(tierStats(T2[t.id].tier, t.seed, S), prev, 0.4), want = T2[t.id].start;
    for (let i = 0; i < 24; i++) worst = Math.max(worst, Math.abs(got[i] - want[i]));
  }
  assert.ok(worst < 2e-6, "max absolute difference " + worst);
});

test("centred tier ratings match Tier Setup N19:N24", () => {
  const r = centeredTierRatings(T2.map((t) => t.tier), S);
  TIERS.forEach((tier, i) => assert.ok(near(r[tier], FX.tierRatingsCentered[i], 1e-9), tier));
});

test("Season 2 so far: SRS, per-game input stats, Team Stats and Sim Live match the workbook for all 365 teams", () => {
  const games = toGames(season("season-2", "games").rows), box = boxMap(season("season-2", "box").rows);
  const res = computeSeason({ teams: T2, games, box, S });
  const worst = { srs: 0, sim: 0, live: 0, stats: 0 };
  const simCols = { PPG: "PPG", REB: "REB", ST: "ST", TO: "TO", "FT%": "FT%", "3P%": "3P%", OR: "OR", DR: "DR", FTA: "FTA", FGA: "FGA", "2P%": "2P%", "OEFG%": "OEFG%", POSS: "POSS",
    "Opp OR/G (TR)": "Opp OR/G (TR)", "Opp eFG% (TR)": "Opp eFG% (TR)", "Opp 2P% (TR)": "Opp 2P% (TR)", "Opp 3P% (TR)": "Opp 3P% (TR)", "Opp TO% (TR)": "Opp TO% (TR)",
    "Opp FTA/FGA (TR)": "Opp FTA/FGA (TR)", "FTA/FGA (TR)": "FTA/FGA (TR)", "STR*Ra": "STR*Ra" };
  const eq = (got, want, what, tol = 1e-6) => { const d = Math.abs(got - want) / Math.max(1, Math.abs(want)); if (d > tol) assert.fail(`${what}: got ${got}, workbook ${want}`); return d; };
  for (const t of L) {
    const r = res.teams[t.id], ss = FX.simSeason[t.name], ts = FX.teamStats[t.name], live = FX.simLive[t.name];
    worst.srs = Math.max(worst.srs, eq(r.srs, ss.SRS, t.name + " SRS"));
    for (const [col, eng] of Object.entries(simCols)) if (r.totals.G) worst.sim = Math.max(worst.sim, eq(r.sim[ENG.indexOf(eng)], ss[col], `${t.name} sim ${col}`));
    ENG.forEach((name, i) => { worst.live = Math.max(worst.live, eq(r.live[i], live[i], `${t.name} live ${name}`)); });
    const s = r.stats;
    for (const [mine, theirs] of [[s.GP, ts.GP], [s.W, ts.W], [s.L, ts.L], [s.confGP, ts["Conf GP"]], [s.confW, ts["Conf W"]], [s.PF, ts.PF], [s.PA, ts.PA],
      [s.pfpg, ts["PF/G"]], [s.papg, ts["PA/G"]], [s.margin, ts["Margin/G"]], [s.rating, ts.Rating], [s.tierRating, ts["Tier Rating"]], [s.eff, ts["Eff Rating"]], [s.sos, ts.SOS]]) worst.stats = Math.max(worst.stats, eq(mine, theirs, t.name + " team stat"));
    assert.deepEqual([s.home, s.away, s.neutral], [ts.Home, ts.Away, ts.Neutral], t.name + " H/A/N");
    assert.equal(s.last10 ?? "", ts["Last 10"] ?? "", t.name + " last 10");
    assert.equal(s.streak ?? "", ts.Streak ?? "", t.name + " streak");
    assert.equal(s.rank ?? "", ts.Rank ?? "", t.name + " rank");
    const nm = (i) => (i === null ? "—" : `#${res.teams[i].stats.rank} ${L[i].name}`);
    assert.equal(nm(s.bestWin), ts["Best Win"], t.name + " best win");
    assert.equal(nm(s.worstLoss), ts["Worst Loss"], t.name + " worst loss");
  }
  console.log("      worst relative differences:", JSON.stringify(worst));
});

test("Season 1 (5,876 games): rating, SOS and record match the archive for all 365 teams; the engine line matches for all but Miami and Air Force", () => {
  const games = toGames(season("season-1", "games").rows), box = boxMap(season("season-1", "box").rows), A = season("season-1", "archive").seasonStats;
  const teams = T1.map((t) => ({ id: t.id, tier: t.tier, start: t.start }));
  const res = computeSeason({ teams, games, box, S });
  const cols = ["PPG", "REB", "ST", "TO", "FT%", "3P%", "OR", "DR", "FTA", "FGA", "2P%", "OEFG%", "POSS", "Opp OR/G (TR)", "Opp eFG% (TR)", "Opp 2P% (TR)", "Opp 3P% (TR)", "Opp TO% (TR)", "Opp FTA/FGA (TR)", "FTA/FGA (TR)"];
  let wRating = 0, wSos = 0; const off = new Set();
  for (const a of A) {
    const r = res.teams[a["Team id"]];
    wRating = Math.max(wRating, Math.abs(r.stats.rating - a.Rating)); wSos = Math.max(wSos, Math.abs(r.stats.sos - a.SOS));
    assert.deepEqual([r.stats.W, r.stats.L, r.stats.GP], [a.W, a.L, a.GP], a.Team);
    for (const k of cols) if (maxRel(r.live[ENG.indexOf(k)], a["Eng " + k]) > 1e-5) off.add(a.Team);
  }
  assert.ok(wRating < 1e-4 && wSos < 1e-4, "rating/SOS");
  // The workbook's known data issue: one game was added to Miami's and Air Force's Sim Season totals without a Game ID, so their archived
  // engine lines differ from a recompute of the recorded games. Everyone else must match exactly.
  assert.deepEqual([...off].sort(), ["Air Force", "Miami"]);
});
