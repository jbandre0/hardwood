// League state for one season: baseline data (static JSON) + changes saved in the browser, with game rolling, recording,
// playing a day and undo. Works in the browser and in Node (tests): data comes in through a loader function.
import { playRecordedGame } from "../engine.js";
import { computeSeason, ENG } from "./stats.js";

export const FILES = ["teams", "games", "box", "settings", "marquee", "polls", "bracketology", "offseason", "meta", "archive", "ncaa"];

/** loader(path) -> parsed JSON (fetch in the browser, fs in tests) */
export async function loadSeasonData(id, loader, files = FILES) {
  const out = { id };
  await Promise.all(FILES.map(async (f) => {
    if (!files.includes(f)) { out[f] = null; return; }   // the season manifest says which optional files exist
    try { out[f] = await loader(`data/seasons/${id}/${f}.json`); } catch { out[f] = null; }
  }));
  out.league = await loader("data/league.json");
  return out;
}

export const toGame = (g) => ({ id: g[0], day: g[1], type: g[2], ctx: g[3], a: g[4], b: g[5], home: g[6], ptsA: g[7], ptsB: g[8] });

/**
 * Build a mutable season state from the baseline data and an optional overlay (what was recorded in this browser).
 * overlay = { games: {id: [ptsA, ptsB]}, box: {id: row}, order: [id...], meta: {id: {seed, at}}, extraGames: [rows] }
 */
export function createState(data, overlay = null) {
  const games = data.games.rows.map(toGame);
  const box = new Map(data.box.rows.map((r) => [r[0], r]));
  const state = { data, games, byId: new Map(games.map((g) => [g.id, g])), box, S: data.settings, recorded: [], meta: {}, cache: null };
  if (overlay) {
    for (const g of overlay.extraGames || []) { const x = toGame(g); state.games.push(x); state.byId.set(x.id, x); }
    for (const id of overlay.order || []) {
      const g = state.byId.get(id), sc = overlay.games[id];
      if (!g || !sc) continue;
      g.ptsA = sc[0]; g.ptsB = sc[1]; box.set(id, overlay.box[id]); state.recorded.push(id); state.meta[id] = (overlay.meta || {})[id] || {};
    }
  }
  return state;
}

export function toOverlay(state, extraGames = []) {
  const o = { format: 1, season: state.data.id, games: {}, box: {}, order: state.recorded.slice(), meta: {}, extraGames };
  for (const id of state.recorded) { const g = state.byId.get(id); o.games[id] = [g.ptsA, g.ptsB]; o.box[id] = state.box.get(id); o.meta[id] = state.meta[id]; }
  return o;
}

/** Full recompute (SRS solved). Cached until the state changes. */
export function calc(state) {
  if (!state.cache) {
    const teams = state.data.teams, tiers = teams;
    state.cache = computeSeason({ teams: tiers, games: state.games, box: state.box, S: state.S });
  }
  return state.cache;
}

export const nextUnplayed = (state) => state.games.find((g) => g.ptsA == null) || null;
export const playedCount = (state) => state.games.filter((g) => g.ptsA != null).length;
export const lastPlayedDay = (state) => state.games.reduce((m, g) => (g.ptsA != null && g.day > m ? g.day : m), 0);
export const gamesOnDay = (state, day) => state.games.filter((g) => g.day === day);

/** engine input row for a team from the current Sim Live line */
export function engineRow(state, c, id) {
  return [state.data.league[id].name, state.data.teams[id].conf, ...c.teams[id].live];
}
export const venueOf = (g) => (g.home === 0 ? "neutral" : "B_home");

/** Roll a scheduled game without recording it. */
export function rollGame(state, gameId, seed, c = calc(state)) {
  const g = state.byId.get(gameId);
  if (!g) throw new Error(`Game ${gameId} is not on the schedule`);
  if (g.ptsA != null) throw new Error(`Game ${gameId} is already recorded`);
  if (g.a == null || g.b == null) throw new Error(`Game ${gameId} has no teams yet`);
  return playRecordedGame(engineRow(state, c, g.a), engineRow(state, c, g.b), venueOf(g), { seed });
}

const boxRow = (id, r) => [id, r.ot, ...["FGM", "FGA", "TPM", "TPA", "FTM", "FTA", "OR", "DR", "TO", "ST", "POSS"].map((k) => r.boxA[k]),
  ...["FGM", "FGA", "TPM", "TPA", "FTM", "FTA", "OR", "DR", "TO", "ST", "POSS"].map((k) => r.boxB[k])];

/** Record a rolled result against its scheduled game. Does not recompute ratings (call calc() after). */
export function record(state, gameId, result, meta = {}) {
  const g = state.byId.get(gameId);
  if (g.ptsA != null) throw new Error(`Game ${gameId} is already recorded`);
  if (result.ptsA === result.ptsB) throw new Error("tied score");
  g.ptsA = result.ptsA; g.ptsB = result.ptsB;
  state.box.set(gameId, boxRow(gameId, result));
  state.recorded.push(gameId); state.meta[gameId] = { seed: result.seed, at: meta.at || new Date().toISOString(), ...meta };
  state.cache = null;
  return g;
}

/** Roll and record one game (ratings recalculated afterwards, like the macro's RecordCurrentGame). */
export function rollAndRecord(state, gameId, seed) {
  const r = rollGame(state, gameId, seed);
  record(state, gameId, r, { seed });
  calc(state);
  return r;
}

/** Play every unplayed game of one day from the start-of-day state, then recalculate once (the macro's PlayDay). */
export function playDay(state, day, baseSeed) {
  const todo = state.games.filter((g) => g.day === day && g.ptsA == null && g.a != null);
  if (!todo.length) throw new Error(`No unplayed games on day ${day}`);
  const earlier = state.games.find((g) => g.day < day && g.ptsA == null && g.a != null);
  if (earlier) throw new Error(`Day ${earlier.day} still has unplayed games; play days in order`);
  const c = calc(state), results = [];
  for (const g of todo) {
    const r = rollGame(state, g.id, (baseSeed + g.id * 2654435761) >>> 0, c);
    results.push([g, r]);
  }
  for (const [g, r] of results) record(state, g.id, r, { seed: r.seed });
  calc(state);
  return results.map(([g, r]) => ({ id: g.id, a: g.a, b: g.b, ptsA: r.ptsA, ptsB: r.ptsB, ot: r.ot }));
}

/** Undo the most recently recorded game that was recorded on this site (never the imported baseline). */
export function undoLast(state, count = 1) {
  const removed = [];
  for (let i = 0; i < count && state.recorded.length; i++) {
    const id = state.recorded.pop(), g = state.byId.get(id);
    removed.push({ id, ptsA: g.ptsA, ptsB: g.ptsB });
    g.ptsA = null; g.ptsB = null; state.box.delete(id); delete state.meta[id];
  }
  state.cache = null;
  return removed;
}

export { ENG };
