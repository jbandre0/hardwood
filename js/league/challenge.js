// Bracket challenge: fill in all 67 games of the NCAA bracket before it starts, scored as it plays.
// Picks are keyed by the real game id (5810-5876), so a pick is right when the real winner of that game is the pick.
import { ncaaGames } from "./tournament.js";

export const ROUND_POINTS = { 48: 5, 49: 10, 50: 20, 51: 40, 52: 80, 53: 160, 54: 320 };
export const ROUND_NAMES = { 48: "First Four", 49: "Round of 64", 50: "Round of 32", 51: "Sweet 16", 52: "Elite Eight", 53: "Final Four", 54: "Championship" };
export const MAX_POINTS = Object.entries(ROUND_POINTS).reduce((s, [d, p]) => s + p * ({ 48: 4, 49: 32, 50: 16, 51: 8, 52: 4, 53: 2, 54: 1 })[d], 0);   // 1,900 plus upset bonuses

// First Four slots work like ESPN's "Michigan St./Texas A&M" line: from the round of 64 on, a First Four game's place in
// the bracket is the slot -g (g = the field's ff number, 1-4), meaning "whoever wins First Four game g". Picking the slot
// is right when the actual winner of that game wins. The First Four games themselves are still picked team by team.
export const FF_FIRST = 5810;
export const isSlot = (t) => typeof t === "number" && t < 0;
export const slotTeams = (field, t) => field.filter((f) => f.ff === -t).map((f) => f.team);
const ffGameOfSlot = (t) => FF_FIRST - t - 1;          // slot -1 -> 5810 ... slot -4 -> 5813
/** seed of a team or a First Four slot */
export const seedMap = (field) => { const m = new Map(field.map((f) => [f.team, f.seed])); for (const f of field) if (f.ff) m.set(-f.ff, f.seed); return m; };
/** a rating function that also rates a First Four slot (the better of its two teams) */
export const slotRating = (field, rating) => (t) => (isSlot(t) ? Math.max(...slotTeams(field, t).map(rating)) : rating(t));

/** the games that exist given a set of picks (teams known from the field and the picked winners) */
export const gamesFor = (field, picks) => ncaaGames(field, (id) => (id >= FF_FIRST && id < FF_FIRST + 4 ? -(id - FF_FIRST + 1) : picks[id]));

/** picks saved before slots existed advanced a First Four team by name: turn those into its slot */
function slotify(field, picks) {
  const ff = new Map(field.filter((f) => f.ff).map((f) => [f.team, f.ff])), out = {};
  for (const [id, t] of Object.entries(picks)) out[id] = +id >= FF_FIRST + 4 && ff.has(t) ? -ff.get(t) : t;
  return out;
}

/** drop picks that no longer make sense (their game isn't set up, or the picked team isn't in it), until stable */
export function prunePicks(field, picks) {
  const out = slotify(field, picks);
  for (let guard = 0; guard < 10; guard++) {
    const byId = new Map(gamesFor(field, out).map((g) => [g.id, g]));
    let changed = false;
    for (const [id, w] of Object.entries(out)) { const g = byId.get(+id); if (!g || (g.a !== w && g.b !== w)) { delete out[id]; changed = true; } }
    if (!changed) break;
  }
  return out;
}

/** set one pick and prune everything downstream that depended on the old one */
export function setPick(field, picks, gameId, team) { return prunePicks(field, { ...picks, [gameId]: team }); }

/** fill every game with `better(gameA, gameB)` -> the winner id (chalk, ratings, ...). Keeps picks already made when keep = true. */
export function completePicks(field, better, base = {}) {
  const picks = prunePicks(field, base);
  for (let guard = 0; guard < 80; guard++) {
    let added = false;
    for (const g of gamesFor(field, picks)) if (picks[g.id] == null) { picks[g.id] = better(g.a, g.b); added = true; }
    if (!added) break;
  }
  return picks;
}
export const chalkPicks = (field, rating) => {
  const seed = seedMap(field), r = slotRating(field, rating);
  return completePicks(field, (a, b) => (seed.get(a) !== seed.get(b) ? (seed.get(a) < seed.get(b) ? a : b) : r(a) >= r(b) ? a : b));
};
export const ratingPicks = (field, rating) => { const r = slotRating(field, rating); return completePicks(field, (a, b) => (r(a) >= r(b) ? a : b)); };

/**
 * Score one entry against the real games. actual = [{id, day, a, b, ptsA, ptsB}] (NCAA games, played or not).
 * Base points by round, plus an upset bonus (winner's seed minus loser's seed, when positive) for a correct pick.
 */
export function scoreEntry(field, rawPicks, actual) {
  const seed = seedMap(field);
  const winners = new Map(), eliminated = new Set(), dayOf = new Map();
  for (const g of actual) {
    dayOf.set(g.id, g.day);
    if (g.ptsA != null) { const w = g.ptsA > g.ptsB ? g.a : g.b, l = w === g.a ? g.b : g.a; winners.set(g.id, { w, l }); eliminated.add(l); }
  }
  // a First Four slot stands for that game's winner once it's played (until then it's alive)
  const resolve = (t) => (isSlot(t) && winners.has(ffGameOfSlot(t)) ? winners.get(ffGameOfSlot(t)).w : t);
  const picks = {}; for (const [id, t] of Object.entries(slotify(field, rawPicks))) picks[id] = resolve(t);
  const byRound = {}; for (const d of Object.keys(ROUND_POINTS)) byRound[d] = { day: +d, name: ROUND_NAMES[d], games: 0, decided: 0, correct: 0, points: 0, bonus: 0 };
  let points = 0, bonus = 0, correct = 0, decided = 0, possible = 0;
  for (let id = 5810; id <= 5876; id++) {
    const day = dayOf.get(id) ?? (id <= 5813 ? 48 : id <= 5845 ? 49 : id <= 5861 ? 50 : id <= 5869 ? 51 : id <= 5873 ? 52 : id <= 5875 ? 53 : 54), r = byRound[day], pts = ROUND_POINTS[day], pick = picks[id];
    r.games++;
    if (winners.has(id)) {
      decided++; r.decided++;
      const res = winners.get(id);
      if (pick === res.w) { const b = Math.max(0, (seed.get(res.w) ?? 0) - (seed.get(res.l) ?? 0)); points += pts; bonus += b; correct++; r.correct++; r.points += pts; r.bonus += b; }
    } else if (pick != null && !eliminated.has(pick)) possible += pts;
  }
  const champ = picks[5876] ?? null;
  return { points, bonus, total: points + bonus, correct, decided, picked: Object.keys(picks).length, maxRemaining: points + bonus + possible, possible, byRound, champion: champ, championAlive: champ != null && !eliminated.has(champ) };
}
