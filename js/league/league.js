// League state for one season: baseline data (static JSON) + changes saved in the browser, with game rolling, recording,
// playing a day and undo. Works in the browser and in Node (tests): data comes in through a loader function.
import { tournamentSeeds, regularSeasonLines, ctSchedule, ctGameId, ncaaGames } from "./tournament.js";
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
  const state = { data, games, byId: new Map(games.map((g) => [g.id, g])), box, S: data.settings, recorded: [], meta: {}, cache: null, extraGames: [], baseline: new Set(games.map((g) => g.id)) };
  state.content = baseContent(data);
  state.contentDirty = new Set();
  if (overlay && overlay.content) for (const [k, v] of Object.entries(overlay.content)) { state.content[k] = v; state.contentDirty.add(k); }
  if (overlay) {
    for (const g of overlay.extraGames || []) { const x = toGame(g); state.games.push(x); state.byId.set(x.id, x); state.extraGames.push(g); }
    for (const id of overlay.order || []) {
      const g = state.byId.get(id), sc = overlay.games[id];
      if (!g || !sc) continue;
      g.ptsA = sc[0]; g.ptsB = sc[1]; box.set(id, overlay.box[id]); state.recorded.push(id); state.meta[id] = (overlay.meta || {})[id] || {};
    }
  }
  syncTournament(state);
  return state;
}

export function toOverlay(state, extraGames = state.extraGames || []) {
  const o = { format: 1, season: state.data.id, games: {}, box: {}, order: state.recorded.slice(), meta: {}, extraGames };
  for (const id of state.recorded) { const g = state.byId.get(id); o.games[id] = [g.ptsA, g.ptsB]; o.box[id] = state.box.get(id); o.meta[id] = state.meta[id]; }
  if (state.contentDirty && state.contentDirty.size) { o.content = {}; for (const k of state.contentDirty) o.content[k] = state.content[k]; }
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
  syncTournament(state);
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
  syncTournament(state);
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
  syncTournament(state);
  return removed;
}

export { ENG };


// ---------------------------------------------------------------------------------------------- editable content
// Ballots, bracketology picks, committee adjustments and articles. The baseline comes from the season's data files (or, for a
// closed season with no live files, from its archive); anything edited in the browser replaces that list wholesale.
const clone = (x) => JSON.parse(JSON.stringify(x));
function baseContent(data) {
  const ap = clone((data.polls && data.polls.ap) || []);
  const power = clone((data.polls && data.polls.power) || []);
  let picks = clone((data.bracketology && data.bracketology.picks) || []);
  let articles = clone((data.bracketology && data.bracketology.articles) || []);
  const commAdj = clone((data.bracketology && data.bracketology.commAdj) || []);
  const arch = data.archive;
  if (!picks.length && arch && arch.bracketHistory) {
    picks = arch.bracketHistory.map((r) => ({ week: r.Week, group: r.Group, team: r["Team id"], seed: r.Seed, region: r.Region, bid: r.Bid, ff: r["FF Game"], bubble: r["Bubble Rank"], note: r.Note }));
  }
  if (!articles.length && arch && arch.articles) {
    articles = arch.articles.map((r) => {
      const wk = /^Week (\d+)/.exec(r.Heading || "");
      return { type: r.Type, week: wk ? +wk[1] : null, heading: r.Heading, headline: r["Title / Matchup"], body: r.Text };
    });
  }
  const weeks = {};
  for (const b of ap) weeks[b.week] = b.afterDay;
  return { ap, power, picks, articles, commAdj, weeks };
}

/** Replace one content list (ap, power, picks, articles, commAdj) and mark it to be saved. */
export function setContent(state, key, value) {
  state.content[key] = value;
  state.contentDirty.add(key);
}


/**
 * Keep the generated tournament games in step with the results: conference tournaments once the regular season is
 * finished, the NCAA tournament once every conference tournament is done and a field exists (content.field, or the
 * baseline ncaa.json). Generated games that are unplayed and no longer valid are dropped. Baseline games are never touched.
 */
export function syncTournament(state) {
  const want = new Map();                                   // id -> row
  const regDone = !state.games.some((g) => (g.type === "Reg" || g.type === "Conf") && g.ptsA == null);
  const teams = state.data.teams, confs = [...new Set(Object.values(teams).map((t) => t.conf))].sort((a, b) => a.localeCompare(b));
  const baseCT = (conf) => state.games.some((g) => g.type === "CT" && g.ctx === conf && state.baseline.has(g.id));
  if (regDone) {
    const reg = state.games.filter((g) => g.type === "Conf" || g.type === "Reg");
    confs.forEach((conf, ci) => {
      if (baseCT(conf)) return;
      const ts = regularSeasonLines(reg, Object.keys(teams).filter((id) => teams[id].conf === conf).map(Number));
      const seeds = tournamentSeeds(ts, reg).map((t) => t.id);
      const win = new Map(state.games.filter((g) => g.type === "CT" && g.ctx === conf && g.ptsA != null).map((g) => [[g.a, g.b].sort().join("|"), g.ptsA > g.ptsB ? g.a : g.b]));
      for (const g of ctSchedule(seeds, (a, b) => win.get([a, b].sort().join("|")))) want.set(ctGameId(g.day, ci, g.pair), [ctGameId(g.day, ci, g.pair), g.day, "CT", conf, g.a, g.b, 0, null, null]);
    });
  }
  const ctOpen = () => confs.some((conf) => !state.games.some((g) => g.type === "CT" && g.ctx === conf && g.day === 47 && g.ptsA != null)) ;
  const field = state.content.field || (state.data.ncaa && state.data.ncaa.field && state.data.ncaa.field.length ? state.data.ncaa.field : null);
  const baseNcaa = state.games.some((g) => g.type === "NCAA" && state.baseline.has(g.id));
  if (field && field.length === 68 && !baseNcaa && regDone && !ctOpen()) {
    const win = new Map(state.games.filter((g) => g.type === "NCAA" && g.ptsA != null).map((g) => [g.id, g.ptsA > g.ptsB ? g.a : g.b]));
    for (const g of ncaaGames(field, (id) => win.get(id))) want.set(g.id, [g.id, g.day, "NCAA", g.ctx, g.a, g.b, 0, null, null]);
  }
  // drop stale generated games that are unplayed, add the missing ones
  for (const row of state.extraGames.slice()) {
    const g = state.byId.get(row[0]);
    if (g && g.ptsA == null && !want.has(row[0]) && (g.type === "CT" || g.type === "NCAA")) {
      state.games.splice(state.games.indexOf(g), 1); state.byId.delete(g.id); state.extraGames.splice(state.extraGames.indexOf(row), 1); state.cache = null;
    }
  }
  for (const [id, row] of want) if (!state.byId.has(id)) {
    const x = toGame(row); state.games.push(x); state.byId.set(id, x); state.extraGames.push(row);
  }
  state.games.sort((a, b) => a.day - b.day || a.id - b.id);
  return state;
}
