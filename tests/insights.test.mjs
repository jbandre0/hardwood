import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { weeklyInsights, draftArticle, phi, statsAsOf } from "../js/league/insights.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const st = createState(data), c = calc(st);

test("normal CDF", () => {
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-7); assert.ok(Math.abs(phi(1.96) - 0.975) < 1e-4); assert.ok(Math.abs(phi(-1) - 0.158655) < 1e-5);
});

test("statsAsOf(last day) equals the live calc; earlier days have fewer games", () => {
  const a = statsAsOf(st, 13), b = statsAsOf(st, 10);
  assert.ok(a.every((s, i) => Math.abs(s.rating - c.teams[i].stats.rating) < 1e-9 && s.GP === c.teams[i].stats.GP));
  assert.ok(b.reduce((x, s) => x + s.GP, 0) < a.reduce((x, s) => x + s.GP, 0));
});

test("Season 2 week 5 insights are grounded in the real games (days 13 only is the newest)", () => {
  const ins = weeklyInsights(st, c, { from: 13, to: 13, sims: 300, engineSims: 2000 });
  // unbeaten count equals a direct count
  const direct = c.teams.filter((t) => t.stats.GP > 0 && t.stats.L === 0).length;
  assert.equal(ins.unbeaten.count, direct);
  assert.equal(ins.weekGames, st.games.filter((g) => g.day === 13 && g.ptsA != null).length);
  for (const u of ins.upsets) { const g = st.byId.get(u.id); assert.equal(u.winner, g.ptsA > g.ptsB ? g.a : g.b); assert.ok(u.pWin < 0.5); }
  assert.ok(ins.projection.teams.every((t) => t.projW >= c.teams[t.id].stats.W - 1e-9 && t.projW <= t.games + 1e-9));
  for (const [conf] of new Map(ins.projection.races.map((r) => [r.conf]))) {
    const sum = ins.projection.teams.filter((t) => t.conf === conf).reduce((s, t) => s + t.pConf, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, conf + " title odds sum to 1");
  }
  assert.ok(ins.whatIfs.length >= 1 && ins.whatIfs.every((w) => w.pA >= 0 && w.pA <= 1));
  const art = draftArticle(ins, { week: 5 });
  assert.ok(art.headline.startsWith("Week 5:"));
  let prose = art.body + art.headline; for (const t of [...data.league].sort((a, b) => b.name.length - a.name.length)) prose = prose.split(t.name).join("");
  assert.ok(!/[–—]/.test(prose), "no em or en dashes in generated prose (team names aside)");
  for (const h of ["UPSET OF THE WEEK", "WHAT IF", "WHERE THIS IS HEADED"]) assert.ok(art.body.includes(h), h);
});
