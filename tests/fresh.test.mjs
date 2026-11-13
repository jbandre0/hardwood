import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc, playDay, playedCount, toOverlay } from "../js/league/league.js";
import { buildFreshSeason1, FRESH_FILES } from "../js/league/fresh.js";
import { playOut } from "./helpers/playout.mjs";

// what a brand-new browser builds for its own league
const src = Object.fromEntries(await Promise.all(FRESH_FILES.map(async ([k, p]) => [k, await readJSON(p)])));
const fresh = buildFreshSeason1(src);
const load = () => loadSeasonData("season-1", async (p) => (p.startsWith("data/seasons/season-1/") ? fresh.files[p.slice(22, -5)] ?? Promise.reject(new Error("missing")) : p.endsWith("editions.json") || p.endsWith("challenge.json") ? {} : readJSON(p)),
  ["teams", "games", "box", "settings", "marquee", "polls", "bracketology", "meta"]);

test("a fresh Season 1 has the commissioner's Season 1 teams, tiers, starting lines and schedule, and nothing played", async () => {
  const s1 = await readJSON("data/seasons/season-1/teams.json"), g1 = await readJSON("data/seasons/season-1/games.json");
  assert.equal(fresh.files.teams.length, 365);
  for (const t of fresh.files.teams) { const o = s1[t.id]; assert.equal(t.tier, o.tier); assert.equal(t.conf, o.conf); assert.deepEqual(t.start, o.start); assert.equal(t.final, undefined); }
  const regular = g1.rows.filter((r) => r[2] === "Reg" || r[2] === "Conf");
  assert.equal(fresh.files.games.rows.length, regular.length);
  assert.ok(fresh.files.games.rows.every((r) => r[7] === null && r[8] === null));
  assert.deepEqual(fresh.files.games.rows.map((r) => r.slice(0, 7)), regular.map((r) => [...r.slice(0, 3), r[3] || "", ...r.slice(4, 7)]));
  assert.equal(fresh.files.box.rows.length, 0); assert.equal(fresh.files.polls.ap.length, 0); assert.equal(fresh.files.bracketology.picks.length, 0);
  assert.equal(fresh.info.id, "season-1"); assert.equal(fresh.info.status, "in-progress");
  // building it never changes the source files it was read from
  assert.ok(g1.rows.every((r) => r[7] != null));
});

test("a fresh Season 1 plays like any season: days, standings, tournaments, a champion", async () => {
  const data = await load();
  const st = createState(data, null);
  assert.equal(playedCount(st), 0); assert.equal(st.content.ap.length, 0); assert.equal(st.content.articles.length, 0);
  playDay(st, 1, 4242);
  assert.ok(playedCount(st) > 50, "day 1 games " + playedCount(st));
  const c = calc(st); assert.ok(c.teams.some((t) => t.stats.GP === 1));
  const o = toOverlay(st); assert.equal(o.season, "season-1"); assert.equal(o.order.length, playedCount(st));
  // round trip through the overlay, then play the whole thing out (conference tournaments and NCAA appear on their own)
  const st2 = playOut(createState(data, o));
  assert.ok(st2.games.some((g) => g.type === "CT") && st2.games.some((g) => g.type === "NCAA" && g.ctx === "Championship" && g.ptsA != null));
});
