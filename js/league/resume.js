// Résumé ratings: how much a team has EARNED, as opposed to the power rating (SRS), which says how GOOD it is.
//
// Wins Above Bubble (WAB), the metric the real selection committee uses:
//   for every game played, take the chance a bubble team (the 45th-best rating) would have won it, at that venue,
//   against that opponent; WAB = actual wins - those expected wins. Beat a top-10 team on the road: about +0.8.
//   Beat the 300th team at home: under +0.1. Lose to it: about -0.9.
// Quadrants, NET style (opponent's current rating rank, by venue):
//   Q1 home 1-30, neutral 1-50, away 1-75; Q2 home 31-75, neutral 51-100, away 76-135;
//   Q3 home 76-160, neutral 101-200, away 136-240; Q4 everything below.
// The calibration (home edge 4 points, logistic scale 8) was fitted on Season 2 and Season 3 results, judging each game with
// the Selection Sunday ratings (which is what WAB does: past games, current ratings).

export const RESUME_DEFAULTS = { bubbleRank: 45, hfa: 4, scale: 8, wabScale: 1.75 };
const Q_LINES = { home: [30, 75, 160], neutral: [50, 100, 200], away: [75, 135, 240] };

/** Quadrant (1-4) of a game against an opponent of rating rank `oppRank`, played at `venue` (home | neutral | away). */
export function quadrant(oppRank, venue) {
  const L = Q_LINES[venue];
  return oppRank <= L[0] ? 1 : oppRank <= L[1] ? 2 : oppRank <= L[2] ? 3 : 4;
}

/**
 * @param teams  [{id, rating, eff}] indexed by id (eff = rating once a team has played, tier rating before)
 * @param games  all games ({day, a, b, home, ptsA, ptsB}); home 1 = b hosts, 0 = neutral; unplayed ones are ignored
 * @returns {rows: [{team, wab, rank, resumeRating, q: [[w,l] x4], gp}], bubble}
 */
export function computeResume({ teams, games, throughDay = Infinity, settings = {} }) {
  const S = { ...RESUME_DEFAULTS, ...settings };
  const eff = teams.map((t) => t.eff ?? t.rating);
  const order = teams.map((t) => t.id).sort((x, y) => eff[y] - eff[x]);
  const rankOf = new Array(teams.length);
  order.forEach((id, i) => (rankOf[id] = i + 1));
  const bubble = eff[order[Math.min(S.bubbleRank, order.length) - 1]];
  const rows = teams.map((t) => ({ team: t.id, wab: 0, gp: 0, q: [[0, 0], [0, 0], [0, 0], [0, 0]] }));
  for (const g of games) {
    if (g.ptsA == null || g.day > throughDay) continue;
    const aWon = g.ptsA > g.ptsB;
    for (const [me, opp, won, venue] of [[g.a, g.b, aWon, g.home === 1 ? "away" : "neutral"], [g.b, g.a, !aWon, g.home === 1 ? "home" : "neutral"]]) {
      const edge = venue === "home" ? S.hfa : venue === "away" ? -S.hfa : 0;
      const pBubble = 1 / (1 + Math.exp(-(bubble - eff[opp] + edge) / S.scale));
      const r = rows[me];
      r.gp++;
      r.wab += (won ? 1 : 0) - pBubble;
      r.q[quadrant(rankOf[opp], venue) - 1][won ? 0 : 1]++;
    }
  }
  // résumé rating: WAB on the power rating's scale (a bubble résumé = the bubble team's rating), for blending and display
  for (const r of rows) r.resumeRating = bubble + S.wabScale * r.wab;
  const played = rows.filter((r) => r.gp > 0).sort((x, y) => y.wab - x.wab || eff[y.team] - eff[x.team]);
  played.forEach((r, i) => (r.rank = i + 1));
  for (const r of rows) if (!r.gp) r.rank = null;
  return { rows, bubble, rankOf };
}
