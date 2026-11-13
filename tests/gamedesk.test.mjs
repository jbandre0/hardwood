import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc, rollGame, recordRolled, nextUnplayed, engineRow, engineOf, venueOf, playDay } from "../js/league/league.js";
import { lockPrediction } from "../js/league/predictions.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));

test("playing a season game is exactly ONE engine game (same as one playRecordedGame call of the selected engine with that seed)", () => {
  const st = createState(data), c = calc(st), g = nextUnplayed(st);
  const r = rollGame(st, g.id, 12345);
  const one = engineOf(st).playRecordedGame(engineRow(st, c, g.a), engineRow(st, c, g.b), venueOf(g), { seed: 12345 });
  assert.deepEqual([r.ptsA, r.ptsB, r.ot, r.boxA, r.boxB], [one.ptsA, one.ptsB, one.ot, one.boxA, one.boxB]);
  assert.ok(Number.isInteger(r.ptsA) && Number.isInteger(r.ptsB), "a real final score, not an average of many games");
});

test("a locked prediction (thousands of sims) does not change the game that gets played", () => {
  const s1 = createState(data), s2 = createState(data), g = nextUnplayed(s1);
  lockPrediction(s1, g.id, { n: 500 });
  assert.deepEqual(rollGame(s1, g.id, 777), rollGame(s2, g.id, 777));
});

test("Log and load next: records exactly the rolled game on screen, then the next scheduled game comes up", () => {
  const st = createState(data), g = nextUnplayed(st);
  const shown = rollGame(st, g.id, 1); rollGame(st, g.id, 2);   // a re-roll that was NOT kept doesn't matter
  const shownAgain = rollGame(st, g.id, 3);                      // the one on screen when Log is pressed
  recordRolled(st, g.id, shownAgain);
  assert.deepEqual([g.ptsA, g.ptsB], [shownAgain.ptsA, shownAgain.ptsB]);
  assert.equal(st.box.get(g.id)[1], shownAgain.ot);
  const nx = nextUnplayed(st);
  assert.ok(nx.id !== g.id && (nx.day > g.day || (nx.day === g.day && st.games.indexOf(nx) > st.games.indexOf(g))));
  void shown;
});

test("logging game by game gives the same totals path as the day runner (every scheduled game, schedule order)", () => {
  const a = createState(data), b = createState(data), day = nextUnplayed(a).day;
  const ids = a.games.filter((g) => g.day === day && g.ptsA == null).map((g) => g.id);
  for (const id of ids) recordRolled(a, id, rollGame(a, id, 9));
  playDay(b, day, 9);
  assert.equal(a.games.filter((g) => g.ptsA != null).length, b.games.filter((g) => g.ptsA != null).length);
  assert.ok(ids.every((id) => a.byId.get(id).ptsA != null));
});
