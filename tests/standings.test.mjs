import test from "node:test";
import assert from "node:assert/strict";
import { league, season, fixture, near } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { confStandings, conferencePower } from "../js/league/standings.js";

const data = await loadSeasonData("season-2", async (p) => (await import("./util.mjs")).readJSON(p));
const c = calc(createState(data)), L = league();
const teams = L.map((t) => { const s = c.teams[t.id].stats, tm = data.teams[t.id]; return { name: t.name, conf: tm.conf, gp: s.GP, w: s.W, l: s.L, cw: s.confW, cl: s.confL, margin: s.margin, rating: s.rating, tierRating: s.tierRating }; });
const FX = fixture("season2-workbook-expected").standings;

test(`conference standings order matches the workbook (${FX.conf}, ${FX.order.length} teams)`, () => {
  assert.deepEqual(confStandings(teams, FX.conf).map((t) => t.name), FX.order);
});

test("every conference's standings sort is consistent with the sort keys", () => {
  for (const conf of new Set(teams.map((t) => t.conf))) {
    const rows = confStandings(teams, conf);
    for (let i = 1; i < rows.length; i++) { const a = rows[i - 1], b = rows[i]; const pa = a.cw / Math.max(1, a.cw + a.cl), pb = b.cw / Math.max(1, b.cw + b.cl); assert.ok(pa >= pb - 1e-12); }
  }
});

test("conference power table matches the workbook for all 31 conferences", () => {
  const mine = conferencePower(teams);
  assert.equal(mine.length, FX.power.length);
  for (const w of FX.power) {
    const m = mine.find((x) => x.conf === w.conf);
    assert.deepEqual([m.teams, m.ncW, m.ncL, m.rank], [w.teams, w.ncW, w.ncL, w.rank], w.conf);
    assert.ok(near(m.ncPct, w.ncPct, 1e-6) && near(m.avgRating, w.avgRating, 1e-6) && near(m.avgTier, w.avgTier, 1e-6), w.conf);
  }
});
