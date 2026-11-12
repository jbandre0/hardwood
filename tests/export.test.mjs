import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { buildSeasonExport, EXPORT_FORMAT } from "../js/league/export.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const st = createState(data);

test("season export carries the whole season so far", () => {
  const x = buildSeasonExport(st, { id: "season-2", label: "Season 2" });
  assert.equal(x.format, EXPORT_FORMAT);
  assert.equal(x.games.rows.length, st.games.filter((g) => g.ptsA != null).length);
  assert.equal(x.teams.length, 365); assert.equal(Object.keys(x.standings).length, 31);
  assert.equal(x.lastEdition.week, 4); assert.equal(x.lastEdition.afterDay, 12); assert.equal(x.nextWeek, 5);
  assert.equal(x.bracketology.articles.length, 5);
  assert.ok(x.bracketology.picks.length >= 5 * 76);
  const c = calc(st); assert.equal(x.teams[342].W, c.teams[342].stats.W);
  const size = JSON.stringify(x).length; assert.ok(size < 3e6, "small enough to attach: " + size);
});
