import test from "node:test";
import assert from "node:assert/strict";
import { readJSON, season } from "./util.mjs";
import { loadSeasonData, createState, calc, playDay, nextUnplayed } from "../js/league/league.js";
import { tierStats, seasonStart } from "../js/league/stats.js";
import { seasonSummary } from "../js/league/summary.js";
import { tierReview, seasonAwards } from "../js/league/offseason.js";
import { buildNextSeason } from "../js/league/newseason.js";
import { playOut } from "./helpers/playout.mjs";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const st = playOut(createState(data)), c = calc(st);

test("fake Season 2 finishes with a champion and all 14 awards", () => {
  const S = seasonSummary(st, c, data.league, st.content.field);
  assert.ok(S.complete && S.title);
  const review = tierReview(S.teams, c.tierRatingByTier, { carry: 0.4, moveGap: 12, maxMoves: 2 }, { 136: "S" });
  assert.equal(review.find((r) => r.team === 136).final, "S");
  assert.equal(review.find((r) => r.team === 136).note, "Override");
  const aw = seasonAwards(S, review, data.league.map((t) => t.name));
  assert.equal(aw.length, 14);
});

test("Season 3 is built: new tiers applied, 40/60 starting lines, valid schedule, playable", () => {
  const S = seasonSummary(st, c, data.league, st.content.field);
  const review = tierReview(S.teams, c.tierRatingByTier);
  const next = buildNextSeason({ prev: data, prevState: st, prevCalc: c, review, marquee: season("season-2", "marquee"), seeds: { conference: 11, nonConference: 12 }, id: "season-3", label: "Season 3" });
  const T = next.files.teams;
  assert.equal(T.length, 365);
  for (const r of review) {
    const t = T[r.team], L = data.league[r.team];
    assert.equal(t.tier, r.final);
    assert.deepEqual(t.start, seasonStart(tierStats(r.final, L.seed, data.settings), c.teams[r.team].live, 0.4));
  }
  assert.equal(next.files.games.rows.length, 5475);
  const s3 = createState({ ...next.files, id: "season-3", league: data.league, archive: null, offseason: null, ncaa: null });
  assert.equal(nextUnplayed(s3).day, 1);
  const res = playDay(s3, 1, 5);
  assert.ok(res.length >= 50, "day 1 games: " + res.length);
  assert.ok(Number.isFinite(calc(s3).teams[0].stats.rating));
});
