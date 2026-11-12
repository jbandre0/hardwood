import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { CATEGORIES, teamLeaders, minGames, gameRows, recordBoard, brokenOn, RECORDS } from "../js/league/leaders.js";

const load = async (id) => { const d = await loadSeasonData(id, async (p) => readJSON(p)); const st = createState(d); return { st, c: calc(st), rows: gameRows(st, id) }; };
const s2 = await load("season-2"), s1 = await load("season-1");

test("game rows cover every played game and agree with the scores", () => {
  assert.equal(s2.rows.length, s2.st.games.filter((g) => g.ptsA != null).length);
  for (const r of s2.rows) { assert.equal(r.A.pts, r.ptsA); assert.equal(r.B.pts, r.ptsB); }
  assert.equal(s1.rows.length, 5876);
});

test("team leaders: every category ranks correctly and per-game numbers equal a direct calculation", () => {
  const totals = s2.c.teams.map((t) => t.totals), minG = minGames(totals);
  for (const [key, , , better] of CATEGORIES) {
    const L = teamLeaders(totals, key, minG);
    assert.ok(L.length > 100, key);
    for (let i = 1; i < L.length; i++) assert.ok(better === "high" ? L[i - 1].value >= L[i].value - 1e-12 : L[i - 1].value <= L[i].value + 1e-12, key);
  }
  const ppg = teamLeaders(totals, "ppg", 1), t0 = ppg[0], T = totals[t0.id];
  assert.ok(Math.abs(t0.value - T.PF / T.G) < 1e-12);
  // direct sum from the game rows
  const pf = new Map(); for (const r of s2.rows) { pf.set(r.a, (pf.get(r.a) || 0) + r.ptsA); pf.set(r.b, (pf.get(r.b) || 0) + r.ptsB); }
  assert.equal(pf.get(t0.id), T.PF);
  const net = teamLeaders(totals, "net", minG)[0]; assert.ok(net.value > 20);
});

test("single-game records: the top entries are the true maxima", () => {
  const board = recordBoard(s1.rows, 5), by = Object.fromEntries(board.map((b) => [b.key, b]));
  assert.equal(board.length, RECORDS.length);
  assert.equal(by.pts.top[0].value, Math.max(...s1.rows.flatMap((r) => [r.ptsA, r.ptsB])));
  assert.equal(by.margin.top[0].value, Math.max(...s1.rows.map((r) => Math.abs(r.ptsA - r.ptsB))));
  assert.equal(by.total.top[0].value, Math.max(...s1.rows.map((r) => r.ptsA + r.ptsB)));
  assert.equal(by.fewest.top[0].value, Math.min(...s1.rows.flatMap((r) => [r.ptsA, r.ptsB])));
  assert.equal(by.ot.top[0].value, Math.max(...s1.rows.map((r) => r.ot)));
  assert.ok(by.fgpct.top[0].value <= 100 && by.fgpct.top[0].row.A.FGA + by.fgpct.top[0].row.B.FGA >= 30);
});

test("records broken on a day: new records are found against everything earlier, none on a quiet day", () => {
  const seasons = [{ label: "season-1", rows: s1.rows }, { label: "season-2", rows: s2.rows }];
  // a made-up monster game on a new day beats the points record
  const fake = { ...s2.rows[0], id: 99999, day: 99, ptsA: 200, ptsB: 40, A: { ...s2.rows[0].A, pts: 200 }, B: { ...s2.rows[0].B, pts: 40 } };
  const broken = brokenOn([...seasons.slice(0, 1), { label: "season-2", rows: [...s2.rows, fake] }], "season-2", 99);
  const keys = broken.map((b) => b.key);
  assert.ok(keys.includes("pts") && keys.includes("margin") && keys.includes("total"), keys.join());
  assert.equal(broken.find((b) => b.key === "pts").entry.value, 200);
  assert.deepEqual(brokenOn(seasons, "season-1", 1), [], "day one never breaks records (nothing before it)");
  assert.ok(brokenOn(seasons, "season-2", 15).every((b) => b.entry.row.day === 15 && b.entry.row.label === "season-2"));
});
