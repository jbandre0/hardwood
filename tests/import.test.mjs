// Phase 1: the imported data must agree with the workbook's own computed values.
import test from "node:test";
import assert from "node:assert/strict";
import { league, season, fixture, readJSON } from "./util.mjs";

const L = league(), name = (i) => L[i].name;

test("league: 365 unique teams with dense ids and unique slugs", () => {
  assert.equal(L.length, 365);
  assert.deepEqual(L.map((t) => t.id), [...L.keys()]);
  assert.equal(new Set(L.map((t) => t.slug)).size, 365);
  assert.equal(new Set(L.map((t) => t.name)).size, 365);
});

test("seasons index lists Season 1 (complete) and Season 2 (in progress)", () => {
  const idx = readJSON("data/seasons/index.json");
  assert.deepEqual(idx.map((s) => [s.id, s.status]), [["season-1", "complete"], ["season-2", "in-progress"]]);
});

test("season 2: schedule is 5,475 games, 30 per team, none twice the same day", () => {
  const G = season("season-2", "games").rows;
  assert.equal(G.length, 5475);
  const per = new Array(365).fill(0), perDay = new Map();
  for (const g of G) {
    per[g[4]]++; per[g[5]]++;
    for (const t of [g[4], g[5]]) { const k = g[1] * 1000 + t; assert.ok(!perDay.has(k), `team ${t} twice on day ${g[1]}`); perDay.set(k, 1); }
  }
  assert.ok(per.every((n) => n === 30), "every team plays exactly 30");
});

test("season 2: played games and box scores line up one-to-one", () => {
  const G = season("season-2", "games").rows, B = season("season-2", "box").rows;
  const played = G.filter((g) => g[7] !== null).map((g) => g[0]).sort((a, b) => a - b);
  assert.equal(played.length, season("season-2", "meta").playedGames);
  assert.deepEqual(B.map((b) => b[0]).sort((a, b) => a - b), played);
  assert.equal(Math.max(...G.filter((g) => g[7] !== null).map((g) => g[1])), season("season-2", "meta").lastPlayedDay);
});

test("season 2: every team's W-L and points match the workbook's Team Stats", () => {
  const G = season("season-2", "games").rows, fx = fixture("season2-workbook-expected").teamStats;
  const rec = L.map(() => ({ w: 0, l: 0, pf: 0, pa: 0 }));
  for (const g of G) if (g[7] !== null) {
    const a = rec[g[4]], b = rec[g[5]];
    a.pf += g[7]; a.pa += g[8]; b.pf += g[8]; b.pa += g[7];
    g[7] > g[8] ? (a.w++, b.l++) : (b.w++, a.l++);
  }
  for (const t of L) {
    const x = fx[t.name], r = rec[t.id];
    assert.deepEqual([r.w, r.l, r.pf, r.pa], [x.W, x.L, x.PF, x.PA], t.name);
  }
});

test("season 1: records and points match the workbook's archived Season Stats", () => {
  const G = season("season-1", "games").rows, A = season("season-1", "archive").seasonStats;
  const rec = L.map(() => ({ w: 0, l: 0 }));
  for (const g of G) g[7] > g[8] ? (rec[g[4]].w++, rec[g[5]].l++) : (rec[g[5]].w++, rec[g[4]].l++);
  assert.equal(A.length, 365);
  for (const a of A) assert.deepEqual([rec[a["Team id"]].w, rec[a["Team id"]].l], [a.W, a.L], a.Team);
});

test("season 1: all 67 archived tournament games equal the site's NCAA games", () => {
  const G = new Map(season("season-1", "games").rows.map((g) => [g[0], g])), M = season("season-1", "archive").mmGames;
  assert.equal(M.length, 67);
  for (const m of M) { const g = G.get(m["Game ID"]); assert.deepEqual([name(g[4]), name(g[5]), g[7], g[8]], [m["Team A"], m["Team B"], m["Pts A"], m["Pts B"]]); }
});

test("archive tables are complete (Season 1)", () => {
  const a = season("season-1", "archive");
  assert.deepEqual([a.titles.length, a.mmResults.length, a.mmGames.length, a.seasonStats.length], [1, 68, 67, 365]);
  assert.equal(a.titles[0].Champion, "Virginia");
});

test("offseason record: tier moves, awards, settings captured", () => {
  const o = season("season-2", "offseason");
  assert.equal(o.tierReview.length, 365);
  assert.deepEqual([o.settings.carry, o.settings.moveGap, o.settings.maxMoves], [0.4, 12, 2]);
  assert.ok(o.awards.some((x) => x.award === "National Champion" && x.team === "Virginia"));
  const counts = {}; for (const r of o.tierReview) counts[r.final] = (counts[r.final] || 0) + 1;
  assert.deepEqual(counts, { S: 25, A: 30, B: 58, C: 69, D: 92, F: 91 });
});

test("season 2 start stats: 365 teams, 24 values each, plausible ranges", () => {
  const T = season("season-2", "teams");
  assert.equal(T.length, 365);
  for (const t of T) { assert.equal(t.start.length, 24); assert.ok(t.start[1] > 55 && t.start[1] < 100, "PPG"); }
});
