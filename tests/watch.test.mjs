import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc, rollGame, recordRolled, nextUnplayed, engineRow, venueOf } from "../js/league/league.js";
import { playRecordedGame } from "../js/engine.js";
import { buildBroadcast, clockLabel, winProb, storyLines, PLAYS } from "../js/league/watch.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const names = (st, g) => ({ A: st.data.league[g.a].name, B: st.data.league[g.b].name });

test("watching a game and playing it are the same game: same seed gives the same score, box score and OT", () => {
  for (const seed of [1, 42, 777, 123456789, 2024]) {
    const st = createState(data), g = nextUnplayed(st);
    const watched = rollGame(st, g.id, seed, calc(st), { keepLog: true }), played = rollGame(st, g.id, seed);
    assert.deepEqual([watched.ptsA, watched.ptsB, watched.ot, watched.boxA, watched.boxB], [played.ptsA, played.ptsB, played.ot, played.boxA, played.boxB], "seed " + seed);
    assert.ok(watched.log.length > 100);
  }
});

test("logging a watched game stores exactly what Play game would store", () => {
  const a = createState(data), b = createState(data), g = nextUnplayed(a);
  recordRolled(a, g.id, rollGame(a, g.id, 99, calc(a), { keepLog: true }));
  recordRolled(b, g.id, rollGame(b, g.id, 99));
  assert.deepEqual(a.byId.get(g.id), b.byId.get(g.id));
  assert.deepEqual(a.box.get(g.id), b.box.get(g.id));
  assert.deepEqual(a.recorded, b.recorded);
  assert.deepEqual(calc(a).teams.map((t) => t.srs), calc(b).teams.map((t) => t.srs));
});

test("broadcast: every possession is shown, scores add up, final matches the game", () => {
  const st = createState(data), g = nextUnplayed(st), r = rollGame(st, g.id, 31337, calc(st), { keepLog: true });
  const bc = buildBroadcast(r, names(st, g), 4);
  assert.equal(bc.events.length, r.log.length);
  assert.deepEqual([bc.final.a, bc.final.b], [r.ptsA, r.ptsB]);
  const sum = { A: 0, B: 0 }; for (const e of bc.events) sum[e.side] += e.pts;
  assert.deepEqual([sum.A, sum.B], [r.ptsA, r.ptsB]);
  for (let i = 1; i < bc.events.length; i++) { assert.ok(bc.events[i].a >= bc.events[i - 1].a && bc.events[i].b >= bc.events[i - 1].b); assert.ok(bc.events[i].t <= bc.events[i - 1].t, "clock only runs down"); }
  assert.ok(bc.events.every((e) => e.wp >= 0 && e.wp <= 1 && e.text.length > 5 && !e.text.includes("{")));
  const last = bc.events[bc.events.length - 1];
  assert.ok(bc.winnerSide === "A" ? last.wp > 0.9 : last.wp < 0.1, "the win probability ends on the winner: " + last.wp);
  assert.ok(bc.stats.leadChanges >= 0 && bc.stats.maxLeadA >= 0 && bc.stats.maxLeadB >= 0);
  assert.ok(storyLines(bc, names(st, g)).length >= 3);
});

test("every outcome code the engine can produce has play-by-play text", () => {
  const st = createState(data), seen = new Set();
  for (let s = 1; s <= 120; s++) { const g = nextUnplayed(st), r = playRecordedGame(engineRow(st, calc(st), g.a), engineRow(st, calc(st), g.b), venueOf(g), { seed: s, keepLog: true }); r.log.forEach((e) => seen.add(e.code)); }
  for (const c of seen) assert.ok(PLAYS[c], "code " + c);
  assert.ok(seen.size >= 22, "saw " + seen.size + " distinct outcomes");
});

test("clock labels and win probability behave", () => {
  assert.equal(clockLabel(2400), "1H 20:00"); assert.equal(clockLabel(1200.5), "1H 0:01"); assert.equal(clockLabel(1199), "2H 19:59");
  assert.equal(clockLabel(65), "2H 1:05"); assert.equal(clockLabel(-10), "OT 4:50"); assert.equal(clockLabel(-310), "OT2 4:50");
  assert.ok(Math.abs(winProb(0, 2400, 0) - 0.5) < 1e-9);
  assert.ok(winProb(10, 300, 0) > winProb(10, 1200, 0), "a lead is safer with less time left");
  assert.ok(winProb(-5, 60, 0) < 0.2 && winProb(5, 10, 0) > 0.9);
  assert.ok(winProb(0, 2400, 8) > 0.6, "a better team starts as the favorite");
});
