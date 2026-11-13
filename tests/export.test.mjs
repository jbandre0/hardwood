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
  const lastPickWeek = Math.max(...st.content.picks.map((p) => p.week));   // the last published bracketology edition
  const ed = (data.editions || []).find((e) => e.week === lastPickWeek);
  const lastAp = st.content.ap[st.content.ap.length - 1];
  assert.equal(x.lastEdition.week, lastPickWeek); assert.equal(x.nextWeek, lastPickWeek + 1);
  assert.equal(x.lastEdition.afterDay, ed ? ed.afterDay : Math.max(0, ...st.content.ap.filter((b) => b.week === lastPickWeek).map((b) => b.afterDay)));
  void lastAp;
  assert.equal(x.bracketology.articles.length, st.content.articles.length);
  assert.ok(x.bracketology.picks.length >= (lastPickWeek + 1) * 76);
  const c = calc(st); assert.equal(x.teams[342].W, c.teams[342].stats.W);
  const size = JSON.stringify(x).length; assert.ok(size < 3e6, "small enough to attach: " + size);
});
