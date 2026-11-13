// Engine v10 (realism ceiling): what it promises, measured. v9 itself is untouched (engine.js; its own parity tests still run).
import test from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./util.mjs";
import * as V9 from "../js/engine.js";
import * as V10 from "../js/engine-v10.js";
import { loadSeasonData, createState, calc, engineRow, rawEngineRow, engineOf, engineVersion, meanLine, rollGame, record, ENGINES, nextUnplayed } from "../js/league/league.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const L = data.league, mk = (engine) => { const st = createState(data); if (engine) st.content.engine = engine; return st; };
const st10 = mk(), st9 = mk("v9"), c10 = calc(st10), c9 = calc(st9);
const id = (n) => L.find((t) => t.name === n).id, rating = (n) => c10.teams[id(n)].stats.rating;
const ranked = L.map((t) => t.name).sort((a, b) => rating(b) - rating(a)), best = ranked[0], worst = ranked[364], t25 = ranked[24], t10 = ranked[9], median = ranked[182];
const R10 = (n) => engineRow(st10, c10, id(n)), R9 = (n) => engineRow(st9, c9, id(n));

test("v10 is the default engine and v9 is still the unmodified original module", () => {
  assert.equal(engineVersion(st10), "v10"); assert.equal(engineVersion(st9), "v9");
  assert.equal(ENGINES.v9.predict, V9.predict); assert.equal(ENGINES.v9.playRecordedGame, V9.playRecordedGame);
  assert.deepEqual(R9(best), rawEngineRow(st9, c9, id(best)), "v9 plays the raw line");
});

test("the real-life envelope table matches the Tier Setup stat ranges of both seasons", async () => {
  const MAP = { PPG: 3, ST: 5, BL: 6, TO: 7, "FT%": 8, "3P%": 9, "OR per game": 10, "DR per game": 11, "FTA per game": 12, "FGA per game": 13, "2P%": 14, "OEFG%": 15, POSS: 18, "Opp OR/G (TR)": 19, "Opp eFG% (TR)": 20, "Opp 2P% (TR)": 21, "Opp 3P% (TR)": 22, "Opp TO% (TR)": 23, "Opp FTA/FGA (TR)": 24, "FTA/FGA (TR)": 25 };
  for (const sid of ["season-1", "season-2"]) {
    const S = readJSON(`data/seasons/${sid}/settings.json`);
    assert.equal(S.statRanges.length, V10.ENVELOPE.length);
    for (const r of S.statRanges) { const e = V10.ENVELOPE.find((x) => x[0] === MAP[r.stat]); assert.ok(e, r.stat); assert.ok(Math.abs(e[2] - Math.min(...r.min)) < 1e-3 && Math.abs(e[3] - Math.max(...r.max)) < 1e-3 && Math.abs(e[4] - r.resSD) < 1e-3, `${sid} ${r.stat}`); }
  }
});

test("strength ceiling: ratings are untouched in the normal range, compressed beyond it, and never pass the caps", () => {
  const f = V10.cappedRating;
  for (const R of [-24, -10, 0, 12, 26]) assert.equal(f(R), R);
  assert.ok(Math.abs(f(26.0001) - 26.0001) < 1e-3 && Math.abs(f(-24.0001) + 24.0001) < 1e-3, "continuous at the knees");
  let prev = -Infinity; for (let R = -80; R <= 80; R += 0.5) { const v = f(R); assert.ok(v >= prev - 1e-12, "monotone"); prev = v; assert.ok(v < 34 && v > -31); }
  assert.ok(f(46.3) > 33 && f(46.3) < 34, "Alabama's 46 becomes about 34: " + f(46.3));
  assert.ok(f(-40) < -30 && f(-40) > -31);
});

test("an average team's line is unchanged; a runaway team's line is pulled back toward real-life levels, keeping its style", () => {
  const med = rawEngineRow(st10, c10, id(median)), medC = R10(median);
  const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));
  assert.ok(med.every((v, i) => typeof v === "string" || near(v, medC[i])), "median team unchanged");
  const raw = rawEngineRow(st10, c10, id(best)), eff = R10(best);
  assert.ok(raw[3] > 100 && eff[3] < 99, `Alabama points ${raw[3].toFixed(1)} -> ${eff[3].toFixed(1)}`);
  assert.ok(raw[9] > 44 && eff[9] < 43, `Alabama 3P% ${raw[9].toFixed(1)} -> ${eff[9].toFixed(1)}`);
  assert.ok(raw[8] > 85 && eff[8] < 84, `Alabama FT% ${raw[8].toFixed(1)} -> ${eff[8].toFixed(1)}`);
  const hot = L.map((t) => rawEngineRow(st10, c10, t.id)[9]); assert.ok(Math.max(...hot) > 50, "some team had a 50%+ three-point line");
  assert.ok(Math.max(...L.map((t) => engineRow(st10, c10, t.id)[9])) < 40.75, "no team plays with more than ~4% past the real best three-point line (39.2%)");
  assert.ok(Math.min(...L.map((t) => engineRow(st10, c10, t.id)[9])) > 28.3, "or ~4% below the real worst (29.6%)");
  // a stat may pass the real best by 3% freely, but never by more than 4%
  for (const [ix, pg, lo, hi] of V10.ENVELOPE) for (const t of L) { const r = engineRow(st10, c10, t.id), v = pg ? r[ix] / r[2] : r[ix]; assert.ok(v <= hi * 1.0401 + 1e-9 && v >= lo * 0.9599 - 1e-9, `stat ${ix} of ${t.name}: ${v}`); }
  // the style is kept: the order of the teams on a stat doesn't change except at the cap itself
  const a = L.map((t) => rawEngineRow(st10, c10, t.id)[9]), b = L.map((t) => engineRow(st10, c10, t.id)[9]);
  for (let i = 0; i < 365; i += 7) for (let j = i + 1; j < 365; j += 11) if (Math.abs(a[i] - a[j]) > 1) assert.ok((a[i] - a[j]) * (b[i] - b[j]) >= 0, "the order of teams is never reversed (ties only at the limit)");
});

test("a team at the top of the ratings is about as strong as the best real team, not 46 points better than average", () => {
  const avgRow = ["avg", "x", ...meanLine(c10)], avg9 = V9.predict(R9(best), avgRow, "neutral", { n: 8000, hist: false, seed: 4 });
  const avg10 = V9.predict(R10(best), avgRow, "neutral", { n: 8000, hist: false, seed: 4 });
  assert.ok(avg9.margin > 40, "v9: " + avg9.margin.toFixed(1)); assert.ok(avg10.margin > 28 && avg10.margin < 38, "v10: " + avg10.margin.toFixed(1));
});

test("win probability ceiling: 99% at most, for anyone against anyone, on any floor", () => {
  for (const venue of ["neutral", "B_home", "A_home"]) {
    const r = V10.predict(R10(best), R10(worst), venue, { n: 60000, hist: false, seed: 11 }), p = venue === "B_home" ? 1 - r.p : r.p;
    assert.ok(r.p <= 0.996 && r.p >= 0.004 || (1 - r.p) <= 0.996, `${venue}: ${r.p}`);
    assert.ok(Math.max(r.p, 1 - r.p) <= 0.996 && Math.max(r.p, 1 - r.p) >= 0.975, `${venue}: best vs worst ${(Math.max(r.p, 1 - r.p) * 100).toFixed(2)}%`); void p;
    const v9 = V9.predict(R9(best), R9(worst), venue, { n: 20000, hist: false, seed: 11 }); assert.ok(Math.max(v9.p, 1 - v9.p) > 0.999, "v9 gave the favorite " + Math.max(v9.p, 1 - v9.p));
  }
  const vs25 = V10.predict(R10(best), R10(t25), "neutral", { n: 40000, hist: false, seed: 12 }), vs25v9 = V9.predict(R9(best), R9(t25), "neutral", { n: 40000, hist: false, seed: 12 });
  assert.ok(vs25.p < 0.9 && vs25.p > 0.6, `best vs 25th: v10 ${vs25.p.toFixed(3)} (v9 ${vs25v9.p.toFixed(3)})`); assert.ok(vs25v9.p > vs25.p + 0.08);
  const vs10 = V10.predict(R10(best), R10(t10), "neutral", { n: 40000, hist: false, seed: 13 }); assert.ok(vs10.p < 0.8, `best vs 10th: ${vs10.p.toFixed(3)}`);
});

test("chaos games: about 1.5% of games, deterministic per seed, and an upset of the worst over the best happens about 1% of the time", () => {
  let n = 0; for (let s = 1; s <= 20000; s++) if (V10.isChaos(s)) n++; assert.ok(n > 220 && n < 400, "chaos games in 20,000 seeds: " + n);
  assert.equal(V10.isChaos(777), V10.isChaos(777));
  const A = R10(best), B = R10(worst); let worstWins = 0; const G = 3000;
  for (let s = 1; s <= G; s++) { const r = V10.playRecordedGame(A, B, "neutral", { seed: s * 7 + 1 }); if (r.ptsB > r.ptsA) worstWins++; assert.equal(r.engine, "v10"); }
  assert.ok(worstWins / G > 0.002 && worstWins / G < 0.025, "worst-beats-best rate " + (worstWins / G * 100).toFixed(2) + "%");
  const a = V10.playRecordedGame(A, B, "B_home", { seed: 99 }), b = V10.playRecordedGame(A, B, "B_home", { seed: 99 }); assert.deepEqual([a.ptsA, a.ptsB, a.boxA], [b.ptsA, b.ptsB, b.boxA]);
});

test("predict() agrees with actually playing the games, and blends into the same histogram", () => {
  const A = R10(t25), B = R10(median), N = 4000; let wins = 0, tot = 0;
  for (let s = 1; s <= N; s++) { const r = V10.playRecordedGame(A, B, "neutral", { seed: s * 13 + 5 }); if (r.ptsA > r.ptsB) wins++; tot += r.ptsA + r.ptsB; }
  const p = V10.predict(A, B, "neutral", { n: 20000, seed: 3, hist: true });
  assert.ok(Math.abs(p.p - wins / N) < 0.045, `predict ${p.p.toFixed(3)} vs played ${(wins / N).toFixed(3)}`);   // played games let team B open every time, predict() alternates
  assert.ok(Math.abs(p.total - tot / N) < 2.5);
  assert.equal(p.hist.reduce((s, v) => s + v, 0), p.n);
});

test("games are played and logged with the selected engine, and each logged game says which", () => {
  for (const [st, want] of [[mk(), "v10"], [mk("v9"), "v9"]]) {
    const g = nextUnplayed(st), r = rollGame(st, g.id, 4242); assert.equal(r.engine, want);
    record(st, g.id, r, {}); assert.equal(st.meta[g.id].engine, want);
  }
  const g = nextUnplayed(st10);   // (most teams have at least one stat nudged by the 3-4% limit, so even ordinary games can differ a little)
  const top9 = V9.playRecordedGame(R9(best), R9(worst), "neutral", { seed: 5 }), top10 = V10.playRecordedGame(R10(best), R10(worst), "neutral", { seed: 5 });
  assert.ok(top9.ptsA - top9.ptsB > top10.ptsA - top10.ptsB, `best vs worst margin: v9 ${top9.ptsA - top9.ptsB}, v10 ${top10.ptsA - top10.ptsB}`);
  assert.equal(engineOf(st10), ENGINES.v10);
});

test("league-wide: v10 removes the sure things and the 70-point blowouts without moving ordinary games", () => {
  let seed = 31; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); let sure9 = 0, sure10 = 0, n = 0, big9 = 0, big10 = 0, tot9 = 0, tot10 = 0;
  for (let k = 0; k < 120; k++) { const a = (rnd() * 365) | 0, b = (rnd() * 365) | 0; if (a === b) continue; n++;
    const x = V9.predict(engineRow(st9, c9, a), engineRow(st9, c9, b), "neutral", { n: 1200, hist: false, seed: k + 1 }), y = V10.predict(engineRow(st10, c10, a), engineRow(st10, c10, b), "neutral", { n: 1200, hist: false, seed: k + 1 });
    if (Math.max(x.p, 1 - x.p) >= 0.995) sure9++; if (Math.max(y.p, 1 - y.p) >= 0.995) sure10++; if (Math.abs(x.margin) >= 40) big9++; if (Math.abs(y.margin) >= 40) big10++; tot9 += x.total; tot10 += y.total; }
  assert.ok(sure9 >= 5 && sure10 === 0, `favorites at 99.5%+: v9 ${sure9}, v10 ${sure10} of ${n}`);
  assert.ok(big10 < big9, `average margins of 40+: v9 ${big9}, v10 ${big10}`);
  assert.ok(Math.abs(tot10 / n - tot9 / n) < 3, "scoring environment barely moves: " + (tot9 / n).toFixed(1) + " vs " + (tot10 / n).toFixed(1));
});
