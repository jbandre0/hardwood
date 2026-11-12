import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { seasonSummary } from "../js/league/summary.js";
import { titlesTable, allTime, teamHistory, mostImproved, streaks, headToHead } from "../js/league/history.js";
import { playOut } from "./helpers/playout.mjs";

const load = async (id, play) => {
  const d = await loadSeasonData(id, async (p) => readJSON(p)); let st = createState(d); if (play) st = playOut(st, 99);
  const c = calc(st); return { id, label: id === "season-1" ? "Season 1" : "Season 2", status: "complete", summary: seasonSummary(st, c, d.league, st.content.field || d.ncaa?.field || []), games: st.games, league: d.league };
};
const seasons = [await load("season-1"), await load("season-2", true)];
const names = seasons[0].league.map((t) => t.name);

test("titles table: Season 1 champion Virginia over Seton Hall, Season 2 has a (fake) champion", () => {
  const t = titlesTable(seasons, names);
  assert.equal(t[0].championName, "Virginia"); assert.equal(t[0].runnerUpName, "Seton Hall"); assert.equal(t[0].score, "121-105");
  assert.ok(t[1].champion != null);
});

test("all-time counts add up", () => {
  const A = allTime(seasons);
  assert.equal(A.teams.reduce((s, r) => s + r.titles, 0), 2);
  assert.equal(A.teams.reduce((s, r) => s + r.finalFours, 0), 8);
  assert.equal(A.teams.reduce((s, r) => s + r.appearances, 0), 136);
  assert.equal(A.confs.reduce((s, r) => s + r.bids, 0), 136);
  assert.equal(A.teams.reduce((s, r) => s + r.ctTitles, 0), 62);
  const va = A.teams.find((r) => r.id === 342); assert.ok(va.titles >= 1 && va.wins >= 39);
});

test("team history, most improved, streaks, head-to-head", () => {
  const h = teamHistory(seasons, 342);
  assert.equal(h.length, 2); assert.equal(h[0].W, 39); assert.equal(h[0].champion, true);
  const m = mostImproved(seasons, names);
  assert.ok(m.improved[0].delta >= m.improved[1].delta && m.improved[0].delta > 0 && m.declined[0].delta < 0);
  const s = streaks(seasons, names);
  assert.equal(s.titles[0].length, seasons.every((x) => x.summary.title.champion === 342) ? 2 : 1);
  assert.equal(s.droughts.length, 365);
  // Virginia and Seton Hall met in the Season 1 final
  const hh = headToHead(seasons, 342, 267);
  assert.ok(hh.games.some((g) => g.type === "NCAA" && g.day === 54 && g.aWon && g.aPts === 121));
  assert.equal(hh.aWins + hh.bWins, hh.games.length);
});
