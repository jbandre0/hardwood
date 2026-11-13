// Engine v10 = engine v9 plus a REALISM CEILING. engine.js (v9) is untouched and stays selectable.
//
// Why: in v9 results feed back on themselves (win big -> better inputs -> win bigger), and inputs after ten games are the raw,
// noisy results of those games. So a few teams drifted to lines no real team has (Alabama: rated 46 with 105 points a game
// and 86% from the line, when the best real team of 2025-26 was rated 33), a lot of teams carry absurd single stats (50% from
// three), the best team beat the worst by 70+, and win probabilities hit 100%. v10 fixes that in three steps. v10 changes how
// a game is played from here on; games already played with v9 stay as they were.
//
//  1. STRENGTH CEILING. A team's strength is its rating (SRS = points better than an average team). Ratings above 26 are
//     compressed toward a ceiling of 34 (the best real team was 32.9) and ratings below -24 toward a floor of -31 (the worst real
//     team was -28.7). The team's whole line is scaled toward the league-average line by the same factor, so its style
//     (shooting vs rebounding vs turnovers) is kept and only the size of its edge is limited. Teams between -24 and 26,
//     which is nearly everyone, play exactly as in v9 on this step.
//  2. SINGLE-STAT CEILING. Each stat is soft-limited to about 1.5 standard deviations beyond the best and worst
//     any real team had in any tier (the Tier Setup ranges), so nobody shoots 50% from three or turns it over 6 times a game.
//  3. WIN-PROBABILITY CEILING. In 2% of games ("chaos") both teams play as one equal team on a neutral floor, a freak night
//     where the favorite's edge disappears. That caps any team's chance against any other team at about 99%
//     (98% x 100% + 2% x 50%) and shaves a little off every favorite.
//
// Steps 1 and 2 are done by ceilingRow() (league.js engineRow() calls it); step 3 lives in playRecordedGame(), playGame()
// and predict() below, which take rows that already went through ceilingRow().
import { playRecordedGame as playRecordedGame9, predict as predict9, playGame as playGame9, makeRng } from "./engine.js";

export const VERSION = "v10";
export const CHAOS = 0.02;
export const STRENGTH = { hiKnee: 26, hiMax: 34, loKnee: -24, loMax: -31 };

/** compressed rating: unchanged between loKnee and hiKnee, then a smooth approach to hiMax / loMax */
export function cappedRating(R, s = STRENGTH) {
  if (R > s.hiKnee) { const w = s.hiMax - s.hiKnee; return s.hiKnee + w * Math.tanh((R - s.hiKnee) / w); }
  if (R < s.loKnee) { const w = s.loKnee - s.loMax; return s.loKnee - w * Math.tanh((s.loKnee - R) / w); }
  return R;
}

// [row index, per-game (stored as a season total over `Games`), real-life min, real-life max, residual SD of the stat]
// (min/max over every tier of the Tier Setup stat ranges; tests/engine-v10.test.mjs checks this table against settings.json)
export const ENVELOPE = [
  [3, 0, 61.5692, 92.9726, 4.7640], // PPG
  [5, 0, 5.7744, 7.8490, 1.2824], // ST
  [6, 0, 2.1221, 4.8732, 0.9032], // BL
  [7, 0, 8.7198, 13.7506, 1.1644], // TO
  [8, 0, 68.1401, 77.7132, 3.2248], // FT%
  [9, 0, 29.5684, 39.1769, 2.0873], // 3P%
  [10, 1, 8.4208, 13.5786, 1.6512], // OR per game
  [11, 1, 21.1179, 28.5343, 1.6616], // DR per game
  [12, 1, 17.2395, 24.7161, 2.8874], // FTA per game
  [13, 1, 53.9860, 64.1797, 2.7051], // FGA per game
  [14, 0, 44.4559, 61.6019, 3.0398], // 2P%
  [15, 0, 44.8118, 59.9682, 2.4436], // OEFG%
  [18, 0, 68.1409, 73.2988, 2.5584], // POSS
  [19, 0, 7.7121, 10.0646, 1.0931], // Opp OR/G (TR)
  [20, 0, 44.5884, 57.1713, 2.4777], // Opp eFG% (TR)
  [21, 0, 44.3897, 58.0005, 2.8808], // Opp 2P% (TR)
  [22, 0, 29.5970, 37.6299, 2.0483], // Opp 3P% (TR)
  [23, 0, 14.9158, 17.9918, 2.1126], // Opp TO% (TR)
  [24, 0, 0.2637, 0.4290, 0.0534], // Opp FTA/FGA (TR)
  [25, 0, 0.3236, 0.3852, 0.0485], // FTA/FGA (TR)
];
const SCALED = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25];   // every numeric input except Games(2), STR*Ra(16), HFA(17)
const soft = (x, lo, hi, w) => (x > hi ? hi + w * Math.tanh((x - hi) / w) : x < lo ? lo - w * Math.tanh((lo - x) / w) : x);

/**
 * Steps 1 and 2 for one team: `row` is the raw 26-column engine row, `rating` the team's SRS rating, `mean` the league-average
 * 24-column line (the `live` lines averaged over all teams). Returns a new row; the input is not modified.
 */
export function ceilingRow(row, rating, mean) {
  const r = row.slice(), R = rating || 0, target = cappedRating(R), f = R !== 0 && target !== R ? target / R : 1;
  if (f !== 1) for (const i of SCALED) r[i] = mean[i - 2] + f * (row[i] - mean[i - 2]);
  const G = r[2];
  for (const [ix, perGame, lo, hi, sd] of ENVELOPE) {
    const w = 0.5 * sd, bHi = hi + sd, bLo = lo - sd;                  // limits start one residual SD beyond the real best/worst
    r[ix] = perGame ? soft(r[ix] / G, bLo, bHi, w) * G : soft(r[ix], bLo, bHi, w);
  }
  r[4] = (r[10] + r[11]) / G;       // REB is OR + DR per game
  return r;
}
/** does the ceiling change anything for this team (used to say so on the team page)? */
export const ceilingApplies = (row, rating, mean) => { const c = ceilingRow(row, rating, mean); return SCALED.some((i) => Math.abs(c[i] - row[i]) > 1e-9 * Math.max(1, Math.abs(row[i]))); };

/** both teams as one equal team: the field-by-field average of the two rows */
const equalize = (A, B) => { const m = A.map((v, i) => (i < 2 ? v : (v + B[i]) / 2)); return [m, m.slice()]; };
/** is this seed a chaos game? Uses its own random stream so the game itself is unaffected */
export const isChaos = (seed) => makeRng(((seed >>> 0) ^ 0xa5a5a5a5) >>> 0)() < CHAOS;

export function playRecordedGame(rowA, rowB, venue = "neutral", opts = {}) {
  const seed = opts.seed ?? (Math.random() * 2 ** 32) >>> 0, chaos = isChaos(seed);
  const res = chaos ? (([a, b]) => playRecordedGame9(a, b, "neutral", { ...opts, seed }))(equalize(rowA, rowB)) : playRecordedGame9(rowA, rowB, venue, { ...opts, seed });
  return { ...res, chaos, engine: VERSION };
}

export function playGame(rowA, rowB, venue = "neutral", opts = {}) {
  const seed = opts.seed ?? (Math.random() * 2 ** 32) >>> 0;
  if (isChaos(seed)) { const [a, b] = equalize(rowA, rowB); return playGame9(a, b, "neutral", { ...opts, seed }); }
  return playGame9(rowA, rowB, venue, { ...opts, seed });
}

/** n simulated games: (1 - CHAOS) of them as the two teams, CHAOS of them as chaos games; the results are blended exactly */
export function predict(rowA, rowB, venue = "neutral", { n = 40000, seed = 1, hist = true } = {}) {
  const nChaos = Math.max(2, 2 * Math.round((n * CHAOS) / 2)), nMain = Math.max(2, n - nChaos);
  const main = predict9(rowA, rowB, venue, { n: nMain, seed, hist }), [ea, eb] = equalize(rowA, rowB), odd = predict9(ea, eb, "neutral", { n: nChaos, seed: (seed + 7919) >>> 0, hist });
  const N = main.n + odd.n, w1 = main.n / N, w2 = odd.n / N, mix = (k) => w1 * main[k] + w2 * odd[k];
  const margin = mix("margin"), e2 = w1 * (main.sd ** 2 + main.margin ** 2) + w2 * (odd.sd ** 2 + odd.margin ** 2);
  return {
    p: mix("p"), margin, total: mix("total"), sd: Math.sqrt(Math.max(0, e2 - margin * margin)), scoreA: mix("scoreA"), scoreB: mix("scoreB"), n: N, engine: VERSION,
    hist: hist ? main.hist.map((v, i) => v + odd.hist[i]) : undefined,
  };
}
