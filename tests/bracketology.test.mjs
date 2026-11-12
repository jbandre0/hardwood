import test from "node:test";
import assert from "node:assert/strict";
import { league, season, fixture, near, readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { computeBoard } from "../js/league/bracketology.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const state = createState(data), c = calc(state), L = league();
const teams = L.map((t) => ({ id: t.id, conf: data.teams[t.id].conf, rating: c.teams[t.id].stats.rating, eff: c.teams[t.id].stats.eff }));
const FX = fixture("season2-workbook-expected").board, B = data.bracketology;

test("Bracketology Board for week 4 matches the workbook for all 365 teams", () => {
  const wk = FX.settings.week;
  const { rows, lines } = computeBoard({ teams, games: state.games, throughDay: FX.settings.throughDay, picks: B.picks.filter((p) => p.week === wk), commAdj: B.commAdj.filter((a) => a.week === wk), settings: B.settings });
  assert.ok(near(lines.q1, FX.lines.q1, 1e-9) && near(lines.q2, FX.lines.q2, 1e-9) && near(lines.bad, FX.lines.bad, 1e-9), "quality-win lines");
  let worst = 0;
  for (const r of rows) {
    const w = FX.rows[L[r.team].name];
    assert.deepEqual([r.w, r.l, r.cw, r.cl, r.q1w, r.q2w, r.badL, r.adj], [w.W, w.L, w["Conf W"], w["Conf L"], w["Q1 W"], w["Q2 W"], w["Bad L"], w.Adj], L[r.team].name);
    worst = Math.max(worst, Math.abs(r.score - w.Score), Math.abs(r.seedScore - w["Seed Score"]), Math.abs(r.rating - w.Rating));
    assert.equal(r.bid, w.Bid || "", L[r.team].name + " bid");
    assert.equal(r.atLargeRank, w["At-large Rank"] || null, L[r.team].name + " at-large rank");
    assert.equal(r.status, w.Status || "", L[r.team].name + " status");
  }
  assert.ok(worst < 1e-6, "scores differ by " + worst);
  assert.equal(rows.filter((r) => r.status === "In — at-large").length, 37);
  assert.equal(rows.filter((r) => r.status === "In — auto-bid").length, 31);
});
