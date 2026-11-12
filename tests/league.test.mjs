// Phase 3: record / play a day / undo / overlay round-trip, on in-memory copies only (fake games are never written anywhere).
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc, nextUnplayed, playedCount, lastPlayedDay, playDay, rollAndRecord, rollGame, record, undoLast, toOverlay } from "../js/league/league.js";

const loader = async (p) => readJSON(p);
const hash = (f) => crypto.createHash("sha1").update(fs.readFileSync(path.join(ROOT, f))).digest("hex");
const data = await loadSeasonData("season-2", loader);
const P = data.meta.playedGames, D = data.meta.lastPlayedDay;   // the imported baseline (workbook)
const fresh = (ov) => createState(JSON.parse(JSON.stringify(data)), ov);
const snap = (st) => calc(st).teams.map((t) => [t.stats.GP, t.stats.W, t.stats.PF, t.srs.toFixed(9), t.stats.sos.toFixed(9), ...t.live.map((x) => x.toFixed(9))]);

test(`baseline: ${P} played, days 1-${D} complete, the next game is on day ${D + 1}`, () => {
  const st = fresh();
  assert.equal(playedCount(st), P); assert.equal(lastPlayedDay(st), D);
  assert.equal(nextUnplayed(st).day, D + 1);
  assert.equal(st.games.filter((g) => g.day <= D).filter((g) => g.ptsA == null).length, 0, `day ${D} is complete`);
});

test("play the next two days with fake games: each team plays once a day, totals and box scores stay consistent", () => {
  const before = hash("data/seasons/season-2/games.json"), st = fresh();
  const d13 = playDay(st, D + 1, 1001), d14 = playDay(st, D + 2, 2002);
  for (const day of [d13, d14]) { const seen = new Set(); for (const g of day) { assert.ok(!seen.has(g.a) && !seen.has(g.b)); seen.add(g.a); seen.add(g.b); assert.notEqual(g.ptsA, g.ptsB); } }
  assert.equal(playedCount(st), P + d13.length + d14.length);
  const c = calc(st);
  assert.equal(c.teams.reduce((s, t) => s + t.stats.W, 0), playedCount(st)); assert.equal(c.teams.reduce((s, t) => s + t.stats.L, 0), playedCount(st));
  assert.equal(c.teams.reduce((s, t) => s + t.totals.PF, 0), c.teams.reduce((s, t) => s + t.totals.PA, 0));
  for (const id of st.recorded) { const b = st.box.get(id), g = st.byId.get(id); assert.equal(2 * b[2] + b[4] + b[6], g.ptsA); assert.equal(2 * b[13] + b[15] + b[17], g.ptsB); }
  assert.equal(hash("data/seasons/season-2/games.json"), before, "baseline file untouched");
});

test("playing days out of order is refused", () => {
  const st = fresh();
  assert.throws(() => playDay(st, D + 2, 1), /still has unplayed games/);
});

test("undo restores the exact previous state (every rating, SOS and engine input)", () => {
  const st = fresh(), s0 = snap(st);
  const n = playDay(st, D + 1, 7).length + playDay(st, D + 2, 8).length;
  assert.notDeepEqual(snap(st), s0);
  const removed = undoLast(st, n);
  assert.equal(removed.length, n); assert.equal(playedCount(st), P);
  assert.deepEqual(snap(st), s0);
});

test("recording rules: no double recording, no ties, no recording unscheduled games", () => {
  const st = fresh(), g = nextUnplayed(st);
  rollAndRecord(st, g.id, 5);
  assert.throws(() => rollGame(st, g.id, 5), /already recorded/);
  assert.throws(() => record(st, nextUnplayed(st).id, { ptsA: 70, ptsB: 70, boxA: {}, boxB: {}, ot: 0 }), /tied/);
  assert.throws(() => rollGame(st, 999999, 1), /not on the schedule/);
});

test("browser overlay round-trip: saved games come back identical on a fresh load", () => {
  const st = fresh(); playDay(st, D + 1, 11); rollAndRecord(st, st.games.find((g) => g.day === D + 2 && g.ptsA == null).id, 12);
  const overlay = JSON.parse(JSON.stringify(toOverlay(st)));
  const again = fresh(overlay);
  assert.equal(playedCount(again), playedCount(st));
  assert.deepEqual(snap(again), snap(st));
  assert.deepEqual(again.recorded, st.recorded);
});

test("speed: full recalculation under 250 ms, a whole day of 100 games under 1.5 s", () => {
  const st = fresh();
  let t = performance.now(); st.cache = null; calc(st); const full = performance.now() - t;
  t = performance.now(); playDay(st, D + 1, 3); playDay(st, D + 2, 4); const days = (performance.now() - t) / 2;
  console.log(`      full recalc ${full.toFixed(0)} ms, average day ${days.toFixed(0)} ms`);
  assert.ok(full < 250 && days < 1500);
});

test("an overlay saved against an older import is set aside, not mixed into the new results", async () => {
  const { overlayIsStale } = await import("../js/league/league.js");
  const st = fresh(); playDay(st, D + 1, 5);
  const ov = JSON.parse(JSON.stringify(toOverlay(st)));
  assert.equal(overlayIsStale(data, ov), false);
  const old = { ...ov, baseline: "older-workbook.xlsm|1290" };
  const again = fresh(old);
  assert.ok(again.staleOverlay && again.staleOverlay.games === ov.order.length);
  assert.equal(playedCount(again), P, "only the imported games count");
  // an old overlay without a signature that recorded a game the import now has: stale too
  const g = data.games.rows.find((r) => r[7] != null);
  const legacy = { format: 1, games: { [g[0]]: [50, 40] }, box: { [g[0]]: [g[0], 0] }, order: [g[0]] };
  assert.equal(overlayIsStale(data, legacy), true);
  assert.equal(fresh(legacy).byId.get(g[0]).ptsA, g[7], "the workbook result wins");
});
