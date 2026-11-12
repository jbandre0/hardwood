// "Export for bracketology": the whole season so far in one compact file, for a Claude session to read and write the
// weekly bracketology edition from. Everything is computed from the season state; no forecasts are included.
import { calc } from "./league.js";
import { computeBoard, BOARD_DEFAULTS } from "./bracketology.js";
import { confStandings } from "./standings.js";
import { statsAsOf } from "./insights.js";

export const EXPORT_FORMAT = "hardwood-bracketology-export";

export function buildSeasonExport(state, { id, label, status } = {}) {
  const c = calc(state), L = state.data.league, T = state.data.teams, S = state.data.bracketology?.settings || BOARD_DEFAULTS;
  const played = state.games.filter((g) => g.ptsA != null);
  const throughDay = played.reduce((m, g) => Math.max(m, g.day), 0);
  const content = state.content;
  // the last published edition / ballot tells the next session where "this week" starts
  const bWeeks = [...new Set(content.picks.map((p) => p.week))].sort((a, b) => a - b);
  const lastWeek = bWeeks.length ? bWeeks[bWeeks.length - 1] : null;
  const ap = content.ap || [];
  const lastDay = Math.max(0, ...ap.filter((b) => b.week === lastWeek).map((b) => b.afterDay ?? 0), ...(state.data.editions || []).filter((e) => e.week === lastWeek).map((e) => e.afterDay));
  const before = statsAsOf(state, lastDay);
  const board = computeBoard({ teams: L.map((t) => ({ id: t.id, conf: T[t.id].conf, rating: c.teams[t.id].stats.rating, eff: c.teams[t.id].stats.eff })), games: state.games, throughDay, picks: [], commAdj: [], settings: S }).rows;
  const teams = L.map((t) => {
    const s = c.teams[t.id].stats, b = board.find((r) => r.team === t.id), p = before[t.id];
    return { id: t.id, name: t.name, conf: T[t.id].conf, tier: T[t.id].tier, W: s.W, L: s.L, confW: s.confW, confL: s.confL, home: s.home, away: s.away, neutral: s.neutral,
      pfpg: +s.pfpg.toFixed(1), papg: +s.papg.toFixed(1), margin: +s.margin.toFixed(1), rating: +s.rating.toFixed(2), rank: s.rank, sos: +s.sos.toFixed(2), tierRating: +s.tierRating.toFixed(2),
      last10: s.last10, streak: s.streak, q1w: b.q1w, q2w: b.q2w, badLosses: b.badL, boardScore: +b.score.toFixed(2),
      sinceLastEdition: { ratingThen: p.GP ? +p.rating.toFixed(2) : null, rankThen: p.rank, recordThen: `${p.W}-${p.L}` } };
  });
  const confs = [...new Set(L.map((t) => T[t.id].conf))].sort();
  const standings = Object.fromEntries(confs.map((k) => [k, confStandings(teams.map((t) => ({ ...t, gp: t.W + t.L, w: t.W, l: t.L, cw: t.confW, cl: t.confL })), k).map((t) => t.id)]));
  return {
    format: EXPORT_FORMAT, version: 1, exportedAt: new Date().toISOString(),
    season: { id: id || state.data.id, label: label || state.data.meta?.label || state.data.id, status: status || "in-progress" },
    throughDay, gamesPlayed: played.length, gamesScheduled: state.games.length,
    lastEdition: { week: lastWeek, afterDay: lastDay }, nextWeek: lastWeek == null ? 0 : lastWeek + 1,
    boardSettings: S,
    notes: "Team ids index teams[]. games.rows: [id, day, type (Reg|Conf|CT|NCAA), ctx, a, b, home (1 = b hosts, 0 = neutral), ptsA, ptsB, ot]. sinceLastEdition = each team as of the last edition's day, for week-over-week movement.",
    teams, standings,
    games: { cols: ["id", "day", "type", "ctx", "a", "b", "home", "ptsA", "ptsB", "ot"], rows: played.map((g) => [g.id, g.day, g.type, g.ctx || "", g.a, g.b, g.home, g.ptsA, g.ptsB, (state.box.get(g.id) || [])[1] || 0]) },
    upcoming: state.games.filter((g) => g.ptsA == null && g.a != null).slice(0, 2000).map((g) => [g.id, g.day, g.type, g.a, g.b, g.home]),
    ap, power: content.power || [],
    bracketology: { picks: content.picks, commAdj: content.commAdj, articles: content.articles.map((a) => ({ type: a.type || "Bracketology", week: a.week ?? null, headline: a.headline || a.heading || "", body: a.body })) },
    ncaaField: content.field || null,
  };
}
