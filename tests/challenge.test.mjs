import test from "node:test";
import assert from "node:assert/strict";
import { readJSON, league } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { gamesFor, prunePicks, setPick, chalkPicks, ratingPicks, completePicks, scoreEntry, ROUND_POINTS } from "../js/league/challenge.js";

const data = await loadSeasonData("season-1", async (p) => readJSON(p));
const st = createState(data), c = calc(st), field = data.ncaa.field;
const rating = (id) => c.teams[id].stats.rating;
const actual = st.games.filter((g) => g.type === "NCAA");
const real = {}; for (const g of actual) real[g.id] = g.ptsA > g.ptsB ? g.a : g.b;

test("a full set of picks has 67 games, each pick is one of the two teams in its game", () => {
  const p = chalkPicks(field, rating);
  assert.equal(Object.keys(p).length, 67);
  const games = new Map(gamesFor(field, p).map((g) => [g.id, g]));
  assert.equal(games.size, 67);
  for (const [id, w] of Object.entries(p)) { const g = games.get(+id); assert.ok(g.a === w || g.b === w, id); }
  assert.ok(Math.min(...Object.keys(p)) === 5810 && Math.max(...Object.keys(p)) === 5876);
});

test("chalk and rating brackets follow their rule; the champion is a 1 seed in chalk", () => {
  const seed = new Map(field.map((f) => [f.team, f.seed]));
  const p = chalkPicks(field, rating);
  for (const g of gamesFor(field, p)) { const w = p[g.id], l = w === g.a ? g.b : g.a; assert.ok(seed.get(w) <= seed.get(l), `game ${g.id}`); }
  assert.equal(seed.get(p[5876]), 1);
  const r = ratingPicks(field, rating);
  for (const g of gamesFor(field, r)) { const w = r[g.id], l = w === g.a ? g.b : g.a; assert.ok(rating(w) >= rating(l)); }
});

test("changing an early pick removes the picks that depended on it, and only those", () => {
  const p = chalkPicks(field, rating), g0 = gamesFor(field, p).find((g) => g.id === 5814), champ = p[5876];
  const loser = p[5814] === g0.a ? g0.b : g0.a, winner = p[5814];
  const q = setPick(field, p, 5814, loser);
  assert.equal(q[5814], loser);
  assert.ok(Object.keys(q).length < 67, "later picks that used the old winner are gone");
  // the old winner can no longer appear in any later pick of that path
  const games = new Map(gamesFor(field, q).map((g) => [g.id, g]));
  for (const [id, w] of Object.entries(q)) { const g = games.get(+id); assert.ok(g && (g.a === w || g.b === w)); }
  // refilling gives a full valid bracket again
  assert.equal(Object.keys(completePicks(field, (a, b) => a, q)).length, 67);
  void champ; void winner;
  // a pick for a team that isn't in the game is rejected by pruning
  assert.equal(prunePicks(field, { 5814: -5 })[5814], undefined);
});

test("scoring: a perfect bracket scores every point; scores add up round by round; max remaining works", () => {
  const perfect = scoreEntry(field, real, actual);
  assert.equal(perfect.correct, 67); assert.equal(perfect.decided, 67);
  const base = Object.entries({ 48: 4, 49: 32, 50: 16, 51: 8, 52: 4, 53: 2, 54: 1 }).reduce((s, [d, n]) => s + n * ROUND_POINTS[d], 0);
  assert.equal(perfect.points, base);
  assert.equal(perfect.bonus, actual.filter((g) => g.ptsA != null).reduce((s, g) => { const w = real[g.id], l = w === g.a ? g.b : g.a, sd = new Map(field.map((f) => [f.team, f.seed])); return s + Math.max(0, sd.get(w) - sd.get(l)); }, 0));
  assert.equal(perfect.total, perfect.points + perfect.bonus);
  assert.equal(Object.values(perfect.byRound).reduce((s, r) => s + r.points, 0), perfect.points);
  assert.equal(perfect.byRound[54].correct, 1);
  const chalk = scoreEntry(field, chalkPicks(field, rating), actual);
  assert.ok(chalk.total < perfect.total && chalk.correct >= 20);
  // nothing played yet: max remaining counts every pick still alive
  const none = scoreEntry(field, chalkPicks(field, rating), actual.map((g) => ({ ...g, ptsA: null, ptsB: null })));
  assert.equal(none.total, 0); assert.equal(none.maxRemaining, base); assert.equal(none.decided, 0);
  // after the First Four only, a pick on a First Four loser is dead
  const ff = actual.map((g) => (g.day === 48 ? g : { ...g, ptsA: null, ptsB: null }));
  const s2 = scoreEntry(field, real, ff); assert.equal(s2.correct, 4); assert.equal(s2.maxRemaining, base);
  const wrong = { ...real, 5810: actual.find((g) => g.id === 5810).a === real[5810] ? actual.find((g) => g.id === 5810).b : actual.find((g) => g.id === 5810).a };
  assert.equal(scoreEntry(field, wrong, ff).correct, 3);
});
