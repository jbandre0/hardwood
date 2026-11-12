import test from "node:test";
import assert from "node:assert/strict";
import { league, readJSON, season, near } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { seasonSummary } from "../js/league/summary.js";
import { tierReview, seasonAwards, offseasonConfPower } from "../js/league/offseason.js";

const data = await loadSeasonData("season-1", async (p) => readJSON(p));
const st = createState(data), c = calc(st), L = league();
const S = seasonSummary(st, c, L, data.ncaa.field);
const OFF = season("season-2", "offseason");   // the workbook's Offseason + Tier Review for Season 1
const snap = Object.fromEntries(OFF.tierReview.map((r) => [r.oldTier, r.tierRating]));
const names = L.map((t) => t.name);

test("tier ratings at the end of Season 1 equal the workbook snapshot (Offseason N7:N12, stored to 4 dp)", () => {
  for (const [k, v] of Object.entries(snap)) assert.ok(near(c.tierRatingByTier[k], v, 1e-4), k);
});

test("tier review matches the workbook for all 365 teams (closest, suggested, final, note)", () => {
  const ov = Object.fromEntries(OFF.tierReview.filter((r) => r.override).map((r) => [r.team, r.override]));
  const mine = tierReview(S.teams, c.tierRatingByTier, OFF.settings, ov);
  assert.equal(mine.length, 365);
  for (const w of OFF.tierReview) {
    const m = mine.find((x) => x.team === w.team);
    assert.ok(near(m.rating, w.rating, 1e-4), names[w.team]);
    assert.deepEqual([m.closest, m.suggested, m.final, m.note], [w.closest, w.suggested, w.final, w.note], names[w.team]);
  }
});

test("conference power (offseason) matches for all 31 conferences", () => {
  const mine = offseasonConfPower(S);
  assert.deepEqual(mine.map((r) => r.conf), OFF.confPower.map((r) => r.conf));
  for (const w of OFF.confPower) { const m = mine.find((x) => x.conf === w.conf); assert.deepEqual([m.teams, m.ncaaBids, m.tourneyWins], [w.teams, w.ncaaBids, w.tourneyWins], w.conf); assert.ok(near(m.avgRating, w.avgRating, 1e-4), w.conf); }
});

test("all 14 Season 1 awards match the workbook word for word", () => {
  const review = tierReview(S.teams, c.tierRatingByTier, OFF.settings);
  const mine = seasonAwards(S, review, names, OFF.settings);
  assert.deepEqual(mine.map((a) => [a.award, a.team, a.detail]), OFF.awards.map((a) => [a.award, a.team, a.detail]));
});
