// The Bracketology Board: every team's resume as of a week.
//
// Default formula ("resume", since Season 4): half how good you are, half what you've earned.
//   Score = (1 - resumeWeight) * power rating + resumeWeight * résumé rating + committee adjustment + rating/1000
//   The résumé rating is Wins Above Bubble on the power rating's scale (js/league/resume.js). Quadrant wins are
//   NET style (opponent rank by venue); "bad losses" are Q3 and Q4 losses. Before that change the Board was ~80%
//   power rating, so teams that won close games against good teams sat too low and big-margin teams in weak leagues
//   sat too high.
//
// Legacy formula ("workbook", the CommBoard table of the original spreadsheet, kept for parity tests and old seasons):
//   Score = rating + winWeight*(win% - .5) + q1Pts*Q1 wins + q2Pts*Q2 wins - badLossPts*bad losses + committee adjustment + rating/1000
//   Quality lines come from the CURRENT rating ranks (25th / 50th / 100th best rating), venue ignored.
import { computeResume, RESUME_DEFAULTS } from "./resume.js";

/** k-th largest value (1-based), like Excel's LARGE */
const large = (arr, k) => [...arr].sort((a, b) => b - a)[Math.min(k, arr.length) - 1];

/**
 * @param teams    [{id, conf, rating, eff}]
 * @param games    all games ({day, type, a, b, ptsA, ptsB}); unplayed ones are ignored
 * @param picks    this week's committee picks [{team, bid, ff}]
 * @param commAdj  this week's adjustments [{team, adj}]
 */
export function computeBoard({ teams, games, throughDay, picks, commAdj, settings }) {
  const S = { ...BOARD_DEFAULTS, ...settings };
  const legacy = S.formula === "workbook";
  const q1 = large(teams.map((t) => t.rating), S.q1Rank), q2 = large(teams.map((t) => t.rating), S.q2Rank), bad = large(teams.map((t) => t.rating), S.badLossRank);
  const rows = teams.map((t) => ({ team: t.id, conf: t.conf, w: 0, l: 0, cw: 0, cl: 0, q1w: 0, q2w: 0, badL: 0, rating: t.rating }));
  const eff = teams.map((t) => t.eff);
  for (const g of games) {
    if (g.ptsA == null || g.day > throughDay) continue;
    const aWon = g.ptsA > g.ptsB;
    for (const [me, opp, won] of [[g.a, g.b, aWon], [g.b, g.a, !aWon]]) {
      const r = rows[me];
      won ? r.w++ : r.l++;
      if (g.type === "Conf") won ? r.cw++ : r.cl++;
      if (!legacy) continue;
      if (won && eff[opp] >= q1) r.q1w++;
      else if (won && eff[opp] >= q2 && eff[opp] < q1) r.q2w++;
      if (!won && eff[opp] < bad) r.badL++;
    }
  }
  const res = computeResume({ teams: teams.map((t) => ({ id: t.id, rating: t.rating, eff: t.eff })), games, throughDay, settings: S.resume });
  for (const r of rows) {
    const x = res.rows[r.team];
    Object.assign(r, { wab: x.wab, resumeRating: x.resumeRating, resumeRank: x.rank, quads: x.q });
    if (!legacy) { r.q1w = x.q[0][0]; r.q2w = x.q[1][0]; r.badL = x.q[2][1] + x.q[3][1]; }
  }
  const adj = new Map();
  for (const a of commAdj || []) adj.set(a.team, (adj.get(a.team) || 0) + a.adj);
  const auto = new Set((picks || []).filter((p) => p.bid === "Auto").map((p) => p.team));
  const ff = new Set((picks || []).filter((p) => p.ff > 0).map((p) => p.team));
  for (const r of rows) {
    r.winPct = r.w + r.l ? r.w / (r.w + r.l) : 0;
    r.adj = adj.get(r.team) || 0;
    r.score = legacy
      ? r.rating + S.winWeight * (r.winPct - 0.5) + S.q1Pts * r.q1w + S.q2Pts * r.q2w - S.badLossPts * r.badL + r.adj + r.rating / 1000
      : (1 - S.resumeWeight) * r.rating + S.resumeWeight * r.resumeRating + r.adj + r.rating / 1000;
    r.bid = auto.has(r.team) ? "Auto" : "";
  }
  const open = rows.filter((r) => r.bid === "");
  for (const r of rows) {
    r.atLargeRank = r.bid === "Auto" ? null : open.filter((x) => x.score > r.score).length + 1;
    r.status = r.bid === "Auto" ? "In — auto-bid" : r.atLargeRank <= S.atLarge ? "In — at-large" : r.atLargeRank <= S.atLarge + 4 ? "First four out" : r.atLargeRank <= S.atLarge + 8 ? "Next four out" : "";
    r.seedScore = r.score + (r.bid === "" && r.atLargeRank <= S.atLarge && !ff.has(r.team) ? S.seedBump : 0);
  }
  return { rows, lines: { q1, q2, bad, bubble: res.bubble }, formula: legacy ? "workbook" : "resume" };
}

export const BOARD_DEFAULTS = { formula: "resume", resumeWeight: 0.5, resume: RESUME_DEFAULTS,
  q1Rank: 25, q2Rank: 50, badLossRank: 100, winWeight: 8, q1Pts: 1.5, q2Pts: 0.75, badLossPts: 1.5, atLarge: 37, seedBump: 2 };
