import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc, playDay, nextUnplayed, toOverlay, undoLast } from "../js/league/league.js";
import { lockPrediction, lockDay, scorecard, weekOf } from "../js/league/predictions.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));

test("lock a day, play it, score it; predictions survive the overlay round trip and are never overwritten", async () => {
  const st = createState(data), day = nextUnplayed(st).day;
  const n = await lockDay(st, day, { n: 400 });
  assert.equal(n, st.games.filter((g) => g.day === day).length);
  const g0 = st.games.find((g) => g.day === day), before = { ...st.predictions.get(g0.id) };
  assert.throws(() => lockPrediction(st, g0.id, { n: 400 }), /already has a locked prediction/);
  assert.equal(before.rowA.length, 26); assert.equal(before.version, "v9");
  playDay(st, day, 42);
  assert.throws(() => lockPrediction(st, -1), /not on the schedule/);
  assert.throws(() => lockPrediction(st, st.games.find((g) => g.day === day && !st.predictions.has(g.id))?.id ?? st.games.find((g) => g.day === day).id), /already|played/);
  const sc = scorecard(st);
  const v = sc.byVersion[0];
  assert.equal(v.overall.games, n);
  assert.ok(v.overall.accuracy > 0.55 && v.overall.accuracy < 0.95, "accuracy " + v.overall.accuracy);
  assert.ok(v.overall.brier > 0.05 && v.overall.brier < 0.25, "brier " + v.overall.brier);
  assert.equal(v.weeks[0].week, weekOf(day));
  // direct recomputation of Brier
  const br = sc.rows.reduce((s, r) => s + (r.pA - (r.ptsA > r.ptsB ? 1 : 0)) ** 2, 0) / sc.rows.length;
  assert.ok(Math.abs(br - v.overall.brier) < 1e-12);
  // round trip through the saved overlay
  const st2 = createState(data, JSON.parse(JSON.stringify(toOverlay(st))));
  assert.deepEqual(st2.predictions.get(g0.id), before);
  // undo keeps the locked prediction (it was made before the game)
  undoLast(st2, 1);
  assert.deepEqual(st2.predictions.get(g0.id), before);
});

test("scoring math on a toy set", () => {
  const st = { byId: new Map([[1, { ptsA: 70, ptsB: 60 }], [2, { ptsA: 50, ptsB: 80 }]]), predictions: new Map([[1, { id: 1, day: 1, pA: 0.8, margin: 5, total: 140, version: "v9" }], [2, { id: 2, day: 2, pA: 0.6, margin: 2, total: 120, version: "v9" }]]) };
  const o = scorecard(st).byVersion[0].overall;
  assert.ok(Math.abs(o.brier - (0.04 + 0.36) / 2) < 1e-12);
  assert.equal(o.accuracy, 0.5);
  assert.ok(Math.abs(o.marginMAE - (5 + 32) / 2) < 1e-12);
  assert.ok(Math.abs(o.totalBias - ((140 - 130) + (120 - 130)) / 2) < 1e-12);
  assert.ok(Math.abs(o.logLoss - (-(Math.log(0.8) + Math.log(0.4)) / 2)) < 1e-12);
});
