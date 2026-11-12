// Prediction tracker. Before a game is played on this site, the engine's prediction is locked: P(team A wins), expected
// margin and total, the model version, when it was locked, how many simulations, and the exact engine rows used.
// A locked prediction is never overwritten. After the game, it is scored (Brier, log loss, picks, margin and total error).
import { predict } from "../engine.js";
import { engineRow, venueOf, calc } from "./league.js";

export const DEFAULT_SIMS = 3000;
export const BACKTEST = { label: "v9 backtest: real 2026 NCAA Tournament (67 games, 40,000 sims each)", games: 67, accuracy: 0.76, brier: 0.164, logLoss: 0.493, marginMAE: 10.5 };
const r4 = (x) => (typeof x === "number" ? Math.round(x * 1e4) / 1e4 : x);

/** Lock one game's prediction. Throws if it is already locked or already played. */
export function lockPrediction(state, gameId, { n = DEFAULT_SIMS, at = new Date().toISOString(), c = calc(state) } = {}) {
  if (!state.predictions) state.predictions = new Map();
  if (state.predictions.has(gameId)) throw new Error(`Game ${gameId} already has a locked prediction`);
  const g = state.byId.get(gameId);
  if (!g) throw new Error(`Game ${gameId} is not on the schedule`);
  if (g.ptsA != null) throw new Error(`Game ${gameId} has already been played`);
  const rowA = engineRow(state, c, g.a), rowB = engineRow(state, c, g.b), venue = venueOf(g);
  const r = predict(rowA, rowB, venue, { n, seed: (gameId * 2654435761) >>> 0, hist: false });
  const p = { id: gameId, day: g.day, type: g.type, a: g.a, b: g.b, venue, pA: r.p, margin: r4(r.margin), total: r4(r.total), sims: n,
    version: (state.data.meta && state.data.meta.version) || "v9", at, rowA: rowA.map(r4), rowB: rowB.map(r4) };
  state.predictions.set(gameId, p);
  return p;
}

/** Lock every unlocked, unplayed game of a day. onProgress(done, total) lets the page update between games. */
export async function lockDay(state, day, { n = DEFAULT_SIMS, onProgress = () => {}, yieldEvery = 4 } = {}) {
  if (!state.predictions) state.predictions = new Map();
  const todo = state.games.filter((g) => g.day === day && g.ptsA == null && g.a != null && !state.predictions.has(g.id));
  const c = calc(state), at = new Date().toISOString();
  for (let i = 0; i < todo.length; i++) {
    lockPrediction(state, todo[i].id, { n, at, c });
    if ((i + 1) % yieldEvery === 0) { onProgress(i + 1, todo.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  onProgress(todo.length, todo.length);
  return todo.length;
}

export const weekOf = (day) => (day <= 42 ? `Week ${Math.ceil(day / 3)}` : day <= 47 ? "Conference tournaments" : "NCAA Tournament");

function scoreSet(rows) {
  const n = rows.length;
  if (!n) return { games: 0 };
  let brier = 0, ll = 0, hit = 0, mErr = 0, tErr = 0, tBias = 0, mBias = 0;
  for (const x of rows) {
    const y = x.aWon ? 1 : 0, p = Math.min(1 - 1e-4, Math.max(1e-4, x.pA));
    brier += (x.pA - y) ** 2; ll += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    if ((x.pA >= 0.5) === x.aWon) hit++;
    mErr += Math.abs(x.margin - x.actualMargin); mBias += x.margin - x.actualMargin;
    tErr += Math.abs(x.total - x.actualTotal); tBias += x.total - x.actualTotal;
  }
  return { games: n, accuracy: hit / n, brier: brier / n, logLoss: ll / n, marginMAE: mErr / n, marginBias: mBias / n, totalMAE: tErr / n, totalBias: tBias / n };
}

/** Score every played game that has a locked prediction: overall and weekly, per model version, plus calibration. */
export function scorecard(state) {
  const rows = [];
  for (const p of (state.predictions || new Map()).values()) {
    const g = state.byId.get(p.id);
    if (!g || g.ptsA == null) continue;
    rows.push({ ...p, aWon: g.ptsA > g.ptsB, actualMargin: g.ptsA - g.ptsB, actualTotal: g.ptsA + g.ptsB, ptsA: g.ptsA, ptsB: g.ptsB });
  }
  rows.sort((x, y) => x.day - y.day || x.id - y.id);
  const versions = [...new Set(rows.map((r) => r.version))];
  const byVersion = versions.map((v) => {
    const R = rows.filter((r) => r.version === v), weeks = [...new Set(R.map((r) => weekOf(r.day)))];
    const buckets = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]].map(([lo, hi]) => {
      const B = R.map((r) => ({ fav: Math.max(r.pA, 1 - r.pA), favWon: r.pA >= 0.5 ? r.aWon : !r.aWon })).filter((x) => x.fav >= lo && x.fav < hi);
      return { range: `${Math.round(lo * 100)}-${Math.min(100, Math.round(hi * 100))}%`, games: B.length, expected: B.length ? B.reduce((s, x) => s + x.fav, 0) / B.length : null, actual: B.length ? B.filter((x) => x.favWon).length / B.length : null };
    });
    return { version: v, overall: scoreSet(R), weeks: weeks.map((w) => ({ week: w, ...scoreSet(R.filter((r) => weekOf(r.day) === w)) })), calibration: buckets };
  });
  const pending = [...(state.predictions || new Map()).values()].filter((p) => { const g = state.byId.get(p.id); return g && g.ptsA == null; });
  return { rows, byVersion, pending };
}
