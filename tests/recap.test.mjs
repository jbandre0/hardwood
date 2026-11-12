import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState } from "../js/league/league.js";
import { dayRecap, dayDone } from "../js/league/recap.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const st = createState(data);

test("day 13 recap matches the raw games", () => {
  assert.ok(dayDone(st, 13)); assert.ok(!dayDone(st, 14));
  const R = dayRecap(st, 13), raw = st.games.filter((g) => g.day === 13);
  assert.equal(R.games.length, raw.length);
  assert.equal(R.top25.length, 25); assert.deepEqual(R.top25.map((x) => x.rank), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.ok(R.upsets.every((g) => g.pWin < 0.5));
  for (const x of R.fellUnbeaten) assert.ok(raw.some((g) => (g.ptsA > g.ptsB ? g.b : g.a) === x.id));
  assert.equal(R.nextDay, 14);
  const h = raw.filter((g) => g.home !== 0);
  assert.equal(R.homeRecord, `${h.filter((g) => g.ptsB > g.ptsA).length}-${h.filter((g) => g.ptsA > g.ptsB).length}`);
});
