// Team leaderboards and single-game records, computed from the box scores of every played game.
import { boxSides } from "./stats.js";

const div = (a, b) => (b ? a / b : 0);

/** team stat categories: [key, label, value(T), better ("high"|"low"), format, short note] */
export const CATEGORIES = [
  ["ppg", "Scoring offense", (T) => div(T.PF, T.G), "high", (v) => v.toFixed(1), "points per game"],
  ["oppg", "Scoring defense", (T) => div(T.PA, T.G), "low", (v) => v.toFixed(1), "points allowed per game"],
  ["margin", "Scoring margin", (T) => div(T.PF - T.PA, T.G), "high", (v) => (v >= 0 ? "+" : "") + v.toFixed(1), "points per game"],
  ["ortg", "Offensive efficiency", (T) => div(T.PF, T.POSS) * 100, "high", (v) => v.toFixed(1), "points per 100 possessions"],
  ["drtg", "Defensive efficiency", (T) => div(T.PA, T.oPOSS) * 100, "low", (v) => v.toFixed(1), "points allowed per 100 possessions"],
  ["net", "Net efficiency", (T) => div(T.PF, T.POSS) * 100 - div(T.PA, T.oPOSS) * 100, "high", (v) => (v >= 0 ? "+" : "") + v.toFixed(1), "points per 100 possessions"],
  ["efg", "Effective FG%", (T) => div(T.FGM + 0.5 * T.TPM, T.FGA) * 100, "high", (v) => v.toFixed(1) + "%", "effective field goal percentage"],
  ["fg", "Field goal %", (T) => div(T.FGM, T.FGA) * 100, "high", (v) => v.toFixed(1) + "%", ""],
  ["tp", "3-point %", (T) => div(T.TPM, T.TPA) * 100, "high", (v) => v.toFixed(1) + "%", ""],
  ["tpa", "3-pointers attempted", (T) => div(T.TPA, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["tpm", "3-pointers made", (T) => div(T.TPM, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["ft", "Free throw %", (T) => div(T.FTM, T.FTA) * 100, "high", (v) => v.toFixed(1) + "%", ""],
  ["fta", "Free throws attempted", (T) => div(T.FTA, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["reb", "Rebounds", (T) => div(T.OR + T.DR, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["orb", "Offensive rebounds", (T) => div(T.OR, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["st", "Steals", (T) => div(T.ST, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["to", "Fewest turnovers", (T) => div(T.TO, T.G), "low", (v) => v.toFixed(1), "per game"],
  ["forced", "Turnovers forced", (T) => div(T.oTO, T.G), "high", (v) => v.toFixed(1), "per game"],
  ["ofg", "Opponent FG%", (T) => div(T.oFGM, T.oFGA) * 100, "low", (v) => v.toFixed(1) + "%", "lower is better"],
  ["otp", "Opponent 3-point %", (T) => div(T.oTPM, T.oTPA) * 100, "low", (v) => v.toFixed(1) + "%", "lower is better"],
  ["pace", "Pace", (T) => div(T.POSS, T.G), "high", (v) => v.toFixed(1), "possessions per game"],
  ["slow", "Slowest pace", (T) => div(T.POSS, T.G), "low", (v) => v.toFixed(1), "possessions per game"],
];

/** ranked rows for one category. totals = calc(state).teams.map(t => t.totals). Teams need at least minG games. */
export function teamLeaders(totals, key, minG = 4) {
  const cat = CATEGORIES.find((c) => c[0] === key);
  if (!cat) throw new Error("unknown category " + key);
  const rows = totals.map((T, id) => ({ id, G: T.G, value: cat[2](T) })).filter((r) => r.G >= minG);
  rows.sort((a, b) => (cat[3] === "high" ? b.value - a.value : a.value - b.value) || b.G - a.G);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** minimum games to qualify: half of the most games any team has played, at least 3 */
export const minGames = (totals) => Math.max(3, Math.floor(Math.max(0, ...totals.map((t) => t.G)) / 2));

// ----------------------------------------------------------------------------------------------- single-game records
export const RECORDS = [
  ["pts", "Most points by a team", (s) => s.pts, "high", (v) => `${v}`],
  ["fewest", "Fewest points by a team", (s) => s.pts, "low", (v) => `${v}`],
  ["margin", "Biggest margin of victory", (s, o, g) => Math.abs(g.ptsA - g.ptsB), "high", (v) => `${v}`, true],
  ["total", "Highest combined score", (s, o) => s.pts + o.pts, "high", (v) => `${v}`, true],
  ["lowtotal", "Lowest combined score", (s, o) => s.pts + o.pts, "low", (v) => `${v}`, true],
  ["tpm", "Most 3-pointers made", (s) => s.TPM, "high", (v) => `${v}`],
  ["tpa", "Most 3-pointers attempted", (s) => s.TPA, "high", (v) => `${v}`],
  ["fta", "Most free throws attempted", (s) => s.FTA, "high", (v) => `${v}`],
  ["ftm", "Most free throws made", (s) => s.FTM, "high", (v) => `${v}`],
  ["reb", "Most rebounds", (s) => s.OR + s.DR, "high", (v) => `${v}`],
  ["orb", "Most offensive rebounds", (s) => s.OR, "high", (v) => `${v}`],
  ["st", "Most steals", (s) => s.ST, "high", (v) => `${v}`],
  ["to", "Most turnovers", (s) => s.TO, "high", (v) => `${v}`],
  ["fgpct", "Best field goal % (30+ attempts)", (s) => (s.FGA >= 30 ? (s.FGM / s.FGA) * 100 : null), "high", (v) => v.toFixed(1) + "%"],
  ["ot", "Most overtime periods", (s, o, g, ot) => ot, "high", (v) => `${v}`, true],
];

/**
 * One record row per played game with a box score:
 * { id, season, label, day, type, ctx, a, b, ptsA, ptsB, ot, A: sideStats, B: sideStats }.
 */
export function gameRows(state, label = "") {
  const rows = [];
  for (const g of state.games) {
    if (g.ptsA == null) continue;
    const bx = state.box.get(g.id); if (!bx) continue;
    const [A, B] = boxSides(bx, g.ptsA, g.ptsB);
    rows.push({ id: g.id, season: state.data.id, label, day: g.day, type: g.type, ctx: g.ctx, a: g.a, b: g.b, ptsA: g.ptsA, ptsB: g.ptsB, ot: bx[1] || 0, A, B });
  }
  return rows;
}

/** every record's top N entries across the given game rows: [{key, title, top: [{value, text, row, team}]}] */
export function recordBoard(rows, top = 5) {
  return RECORDS.map(([key, title, f, better, fmt, gameLevel]) => {
    const list = [];
    for (const r of rows) {
      const sides = gameLevel ? [[r.A, r.B, null]] : [[r.A, r.B, r.a], [r.B, r.A, r.b]];
      for (const [s, o, team] of sides) { const v = f(s, o, r, r.ot); if (v != null) list.push({ value: v, text: fmt(v), row: r, team }); }
    }
    list.sort((x, y) => (better === "high" ? y.value - x.value : x.value - y.value) || x.row.id - y.row.id);
    return { key, title, better, top: list.slice(0, top) };
  });
}

/**
 * Records set on `day` of `label`'s season, against everything played before (earlier seasons, then earlier days).
 * seasons = [{label, rows}] in order. A record is "new" when the day's best entry strictly beats the old best.
 * Needs at least `minBefore` earlier games so day one doesn't break every record.
 */
export function brokenOn(seasons, label, day, { minBefore = 300 } = {}) {
  const before = [], today = [];
  for (const s of seasons) { for (const r of s.rows) { if (s.label === label && r.day === day) today.push(r); else if (s.label !== label || r.day < day) before.push(r); } }
  if (before.length < minBefore || !today.length) return [];
  const old = recordBoard(before, 1), now = recordBoard(today, 3);
  const out = [];
  now.forEach((rec, i) => {
    const prev = old[i].top[0], best = rec.top[0];
    if (!best) return;
    const beats = !prev || (rec.better === "high" ? best.value > prev.value : best.value < prev.value);
    if (beats) out.push({ key: rec.key, title: rec.title, better: rec.better, entry: best, previous: prev || null, ties: rec.top.filter((t) => t.value === best.value).length });
  });
  return out;
}
