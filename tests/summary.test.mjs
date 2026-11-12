import test from "node:test";
import assert from "node:assert/strict";
import { league, readJSON, near } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { seasonSummary } from "../js/league/summary.js";

const data = await loadSeasonData("season-1", async (p) => readJSON(p));
const st = createState(data), c = calc(st), L = league();
const S = seasonSummary(st, c, L, data.ncaa.field);
const A = data.archive;

test("Season 1 title row matches the Titles archive", () => {
  const t = A.titles[0];
  assert.equal(L[S.title.champion].name, t.Champion); assert.equal(L[S.title.runnerUp].name, t["Runner-up"]);
  assert.equal(S.title.score, t["Final Score"]); assert.equal(S.title.upsets, t.Upsets);
  assert.deepEqual(S.title.finalFour.map((id) => L[id].name).sort(), t["Final Four"].split(", ").sort());
});

test("Season 1 MM Games (67) match: round, seeds, winner, margin, upset flag", () => {
  assert.equal(S.ncaa.length, A.mmGames.length);
  for (const r of A.mmGames) {
    const g = S.ncaa.find((x) => x.id === r["Game ID"]);
    assert.deepEqual([g.roundNo, g.seedA, g.seedB, g.w, g.margin, g.upset], [r["Round No"], r["Seed A"], r["Seed B"], r["Winner id"], r.Margin, r.Upset === "Upset"], `game ${r["Game ID"]}`);
  }
});

test("Season 1 MM Results (68) match: wins, losses, last round, result", () => {
  for (const r of A.mmResults) {
    const t = S.teams[r["Team id"]];
    assert.deepEqual([t.seed, t.region, t.tourneyW, t.tourneyL, t.lastRound, t.ncaaResult, t.firstFour], [r.Seed, r.Region, r["Tourney W"], r["Tourney L"], r["Last Round No"], r.Result, r["First Four"] === "Yes"], r.Team);
  }
});

test("Season 1 Season Stats (365) match: record, points, conf tourney, NCAA result, final AP; rating within 1e-5", () => {
  let worst = 0;
  for (const r of A.seasonStats) {
    const t = S.teams[r["Team id"]];
    assert.deepEqual([t.conf, t.tier, t.GP, t.W, t.L, t.confW, t.confL, t.confTourney, t.ncaaResult, t.finalAP], [r.Conf, r.Tier, r.GP, r.W, r.L, r["Conf W"], r["Conf L"], r["Conf Tourney"], r["NCAA Result"], r["Final AP"]], r.Team);
    assert.ok(near(t.pfpg, r["PF/G"], 1e-6) && near(t.papg, r["PA/G"], 1e-6), r.Team);
    worst = Math.max(worst, Math.abs(t.rating - r.Rating));
  }
  console.log("largest rating difference vs archive:", worst.toFixed(5));
  assert.ok(worst < 1e-5);
});
