// Plays a fake season-2 to the end with the runner functions (fake games are not saved anywhere), checking the tournament flow.
import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, playDay, toOverlay, nextUnplayed, calc, setContent, syncTournament } from "../js/league/league.js";
import { computeBoard } from "../js/league/bracketology.js";
import { suggestField, validateField } from "../js/league/field.js";

test("Season 2 can be played through conference tournaments and the NCAA bracket", { timeout: 600000 }, async () => {
  const data = await loadSeasonData("season-2", async (p) => readJSON(p));
  const st = createState(data);
  let guard = 0, lastDay = 0;
  const seen = {};
  while (guard++ < 80) {
    if (!nextUnplayed(st) && lastDay === 47 && !st.content.field) {
      const c = calc(st);
      const teams = Object.keys(data.teams).map((id) => ({ id: +id, conf: data.teams[id].conf, rating: c.teams[id].stats.rating, eff: c.teams[id].stats.eff }));
      const B = data.bracketology;
      const rows = computeBoard({ teams, games: st.games, throughDay: 47, picks: [], commAdj: [], settings: B.settings }).rows;
      const champs = new Map(st.games.filter((g) => g.type === "CT" && g.day === 47).map((g) => [g.ctx, g.ptsA > g.ptsB ? g.a : g.b]));
      const picks = suggestField(rows, B.settings.atLarge, champs);
      assert.deepEqual(validateField(picks).errors, []);
      for (const [conf, team] of champs) assert.ok(picks.some((p) => p.group === "Field" && p.team === team), "every conference champion is in the field");
      setContent(st, "field", picks.filter((p) => p.group === "Field").map((p) => ({ team: p.team, seed: p.seed, region: p.region, ff: p.ff })));
      syncTournament(st);
    }
    if (!nextUnplayed(st)) break;
    const d = nextUnplayed(st).day;
    if (d > lastDay + 0 && d < 43 && d !== lastDay) { /* regular season: play quickly */ }
    playDay(st, d, 12345 + d); lastDay = d;
    if (d >= 43) seen[d] = st.games.filter((g) => g.day === d).length;
    if (d === 42) assert.ok(st.games.some((g) => g.type === "CT" && g.day === 43), "day 43 games generated once the regular season ends");
  }
  assert.equal(lastDay, 54);
  assert.equal(st.games.filter((g) => g.type === "CT" && g.day === 47).length, 31);
  assert.equal(st.games.filter((g) => g.type === "NCAA").length, 67);
  assert.equal(st.games.filter((g) => g.type === "CT").length, 365 - 31);   // single elimination: n-1 games per conference
  assert.ok(st.games.every((g) => g.ptsA != null));
  const o = toOverlay(st);
  assert.equal(o.extraGames.length, 334 + 67);
});
