import test from "node:test";
import assert from "node:assert/strict";
import { league, season } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { confStandings } from "../js/league/standings.js";
import { seedOrder, ctSchedule, ctFirstDay, ctRounds } from "../js/league/tournament.js";

test("seed order for 8 and 16", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
  assert.deepEqual(seedOrder(16).slice(0, 4), [1, 16, 8, 9]);
});
test("round counts: 18 teams start day 43, 9 teams day 44, 6 teams day 45", () => {
  assert.equal(ctFirstDay(18), 43); assert.equal(ctFirstDay(9), 44); assert.equal(ctFirstDay(6), 45); assert.equal(ctFirstDay(2), 47);
});

const data = await loadSeasonData("season-1", async (p) => (await import("./util.mjs")).readJSON(p));
const st = createState(data), c = calc(st), L = league();
const teams = L.map((t) => { const s = c.teams[t.id].stats, tm = data.teams[t.id]; return { id: t.id, conf: tm.conf, gp: s.GP, w: s.W, l: s.L, cw: s.confW, cl: s.confL, margin: s.margin }; });
const confs = [...new Set(teams.map((t) => t.conf))];

import { tournamentSeeds, regularSeasonLines } from "../js/league/tournament.js";
const reg = st.games.filter((g) => g.type !== "CT" && g.type !== "NCAA");
const pairs = (arr) => arr.map((g) => [g.a, g.b].sort().join("|")).sort();

test("Season 1 conference tournaments: first-round pairings reproduced for at least 25 of 31 conferences (tiebreak order is inferred)", () => {
  let ok = 0;
  for (const conf of confs) {
    const real = st.games.filter((g) => g.type === "CT" && g.ctx === conf), first = Math.min(...real.map((g) => g.day));
    const seeds = tournamentSeeds(regularSeasonLines(reg, teams.filter((t) => t.conf === conf).map((t) => t.id)), reg).map((t) => t.id);
    const mine = ctSchedule(seeds, () => undefined);
    assert.equal(mine[0].day, first, conf);                                   // first day always matches
    if (JSON.stringify(pairs(mine)) === JSON.stringify(pairs(real.filter((g) => g.day === first)))) ok++;
  }
  assert.ok(ok >= 25, `only ${ok}`);
});

test("Season 1 conference tournaments: later rounds follow from real winners (game counts per day match when seeds match)", () => {
  let checked = 0;
  for (const conf of confs) {
    const real = st.games.filter((g) => g.type === "CT" && g.ctx === conf), first = Math.min(...real.map((g) => g.day));
    const seeds = tournamentSeeds(regularSeasonLines(reg, teams.filter((t) => t.conf === conf).map((t) => t.id)), reg).map((t) => t.id);
    if (JSON.stringify(pairs(ctSchedule(seeds, () => undefined))) !== JSON.stringify(pairs(real.filter((g) => g.day === first)))) continue;
    const win = new Map(real.map((g) => [[g.a, g.b].sort().join("|"), g.ptsA > g.ptsB ? g.a : g.b]));
    const mine = ctSchedule(seeds, (a, b) => win.get([a, b].sort().join("|")));
    const byDay = (arr) => { const m = {}; for (const g of arr) m[g.day] = (m[g.day] || 0) + 1; return m; };
    if (JSON.stringify(byDay(mine)) === JSON.stringify(byDay(real))) checked++;
  }
  console.log("full-bracket structure reproduced:", checked); assert.ok(checked >= 15, `only ${checked}`);
});

import { ncaaGames } from "../js/league/tournament.js";
test("NCAA bracket: Season 1's field + real winners regenerate all 67 games with the same ids, days, teams and order", () => {
  const field = data.ncaa.field;
  const real = st.games.filter((g) => g.type === "NCAA");
  const win = new Map(real.map((g) => [g.id, g.ptsA > g.ptsB ? g.a : g.b]));
  const mine = ncaaGames(field, (id) => win.get(id));
  assert.equal(mine.length, 67);
  const key = (g) => [g.id, g.day, g.ctx, g.a, g.b].join(",");
  assert.deepEqual(mine.map(key).sort(), real.map(key).sort());
});
test("NCAA bracket: with no results only the First Four and Round of 64 (sans First Four slots) exist", () => {
  const g = ncaaGames(data.ncaa.field, () => undefined);
  assert.equal(g.filter((x) => x.day === 48).length, 4);
  assert.equal(g.filter((x) => x.day === 49).length, 28);
  assert.equal(g.filter((x) => x.day >= 50).length, 0);
});
