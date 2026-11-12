// Offseason: season awards, conference power, tier review and next-season starting lines (workbook sheets Offseason,
// Tier Review and Season Start). Inputs are the seasonSummary() rows, so they work for any season.
import { TIERS, seasonStart } from "./stats.js";

export const DEFAULT_OFFSEASON = { carry: 0.4, moveGap: 12, maxMoves: 2, cinderellaMaxSeed: 9 };

const f1 = (x) => (Math.round(x * 10 + Math.sign(x) * 1e-9) / 10).toFixed(1);       // Excel TEXT(x,"0.0"): half away from zero
const sgn1 = (x) => (x >= 0 ? "+" : "-") + f1(Math.abs(x));

/**
 * Tier review. tierRatings = {S: .., A: ..} snapshot at the end of the season (centred tier ratings).
 * overrides = {teamId: "A"}. Returns one row per team: old tier, rating, gap, closest, suggested, final, change, note.
 */
export function tierReview(teams, tierRatings, settings = DEFAULT_OFFSEASON, overrides = {}) {
  const { moveGap, maxMoves } = { ...DEFAULT_OFFSEASON, ...settings };
  return teams.map((t) => {
    const tierRating = tierRatings[t.tier], gap = t.rating - tierRating;
    let closest = TIERS[0], best = Infinity;
    for (const k of TIERS) { const d = Math.abs(t.rating - tierRatings[k]); if (d < best) { best = d; closest = k; } }
    const n = TIERS.indexOf(t.tier), m = TIERS.indexOf(closest);
    const suggested = Math.abs(gap) < moveGap ? t.tier : TIERS[n + Math.sign(m - n) * Math.min(Math.abs(m - n), maxMoves)];
    const override = overrides[t.id] || null, final = override || suggested;
    const change = n - TIERS.indexOf(final);
    const note = override ? "Override" : final === t.tier ? (Math.abs(gap) >= moveGap ? "Held (already the nearest tier)" : "Fits tier") : change > 0 ? "Well above tier" : "Well below tier";
    return { team: t.id, oldTier: t.tier, rating: t.rating, tierRating, gap, closest, suggested, override, final, change, note };
  });
}

/** Conference power for the offseason page: avg rating, NCAA bids, tournament wins; sorted by avg rating. */
export function offseasonConfPower(summary) {
  const m = new Map();
  for (const t of summary.teams) {
    if (!m.has(t.conf)) m.set(t.conf, { conf: t.conf, teams: 0, sum: 0, ncaaBids: 0, tourneyWins: 0 });
    const r = m.get(t.conf); r.teams++; r.sum += t.rating; if (t.seed != null) r.ncaaBids++; r.tourneyWins += t.tourneyW;
  }
  return [...m.values()].map((r) => ({ conf: r.conf, teams: r.teams, avgRating: r.sum / r.teams, ncaaBids: r.ncaaBids, tourneyWins: r.tourneyWins })).sort((a, b) => b.avgRating - a.avgRating);
}

/** The 14 season awards, same rules and wording as the workbook. names = id -> display name. */
export function seasonAwards(summary, review, names, settings = DEFAULT_OFFSEASON) {
  const { cinderellaMaxSeed } = { ...DEFAULT_OFFSEASON, ...settings };
  const T = summary.teams, nm = (id) => names[id], rec = (t) => `${t.W}-${t.L}`;
  const argmax = (arr, key) => arr.reduce((b, x) => (b === null || key(x) > key(b) ? x : b), null);
  const out = [];
  const add = (award, team, detail) => out.push({ award, team, detail });
  const ti = summary.title;
  if (ti) {
    add("National Champion", nm(ti.champion), `Beat ${nm(ti.runnerUp)} ${ti.score}`);
    add("Runner-up", nm(ti.runnerUp), `Lost ${ti.score} to ${nm(ti.champion)}`);
    add("Final Four", ti.finalFour.map(nm).join(", "), null);
  }
  const top = argmax(T.filter((t) => t.rank != null), (t) => -t.rank);
  add("#1 Power Rating", top.name, `Rating ${f1(top.rating)} · ${rec(top)}`);
  const ap1 = T.find((t) => t.finalAP === 1);
  if (ap1) add("Final AP #1", ap1.name, `Final AP ballot · ${rec(ap1)}`);
  const br = argmax(T, (t) => t.winPct + t.rating / 1e6);
  add("Best Record", br.name, `${rec(br)} (${f1(br.winPct * 100)}%)`);
  const off = argmax(T, (t) => t.pfpg); add("Best Offense", off.name, `${f1(off.pfpg)} points per game`);
  const def = argmax(T, (t) => -t.papg); add("Best Defense", def.name, `${f1(def.papg)} allowed per game`);
  const mar = argmax(T, (t) => t.margin); add("Best Scoring Margin", mar.name, `${sgn1(mar.margin)} points per game`);
  const over = argmax(review, (r) => r.gap), under = argmax(review, (r) => -r.gap);
  add("Overperformer (rating vs tier)", nm(over.team), `Tier ${over.oldTier} · rating ${f1(over.rating)} (${sgn1(over.gap)} vs tier)`);
  add("Underperformer (rating vs tier)", nm(under.team), `Tier ${under.oldTier} · rating ${f1(under.rating)} (${sgn1(under.gap)} vs tier)`);
  const cp = offseasonConfPower(summary)[0];
  add("Best Conference", cp.conf, `Average rating ${f1(cp.avgRating)} · ${cp.ncaaBids} NCAA bids`);
  const cind = argmax(T.filter((t) => t.seed != null && t.seed >= cinderellaMaxSeed), (t) => t.tourneyW * 100 + t.seed);
  if (cind) add("Cinderella", cind.name, `(${cind.seed} seed) ${cind.tourneyW} tournament wins · ${cind.ncaaResult}`);
  const up = argmax(summary.ncaa.filter((g) => g.upset), (g) => (g.seedW - Math.min(g.seedA, g.seedB)) * 1000 + g.margin);
  if (up) add("Biggest Upset", nm(up.w), `(${up.seedW}) over (${up.seedL}) ${nm(up.l)}, ${Math.max(up.ptsA, up.ptsB)}-${Math.min(up.ptsA, up.ptsB)}`);
  return out;
}

/** Next season's starting lines: carry x final engine line + (1-carry) x the new tier line (tierLine(team, tier) supplies it). */
export function nextSeasonStarts(review, finals, tierLine, carry = DEFAULT_OFFSEASON.carry) {
  return review.map((r) => ({ team: r.team, tier: r.final, start: seasonStart(tierLine(r.team, r.final), finals[r.team], carry) }));
}
