// The league's ratings and stats engine, ported from the workbook (Tier Setup, Sim Teams, Season Start, Sim Season,
// Sim Live, Team Stats and the RecalcSRS macro). Pure functions; every formula is validated against the workbook's own
// computed values in tests/stats.test.mjs.
//
// Engine input row layout (24 numbers, same order as Sim Live / the engine's team rows after name and conference):
export const ENG = ["Games", "PPG", "REB", "ST", "BL", "TO", "FT%", "3P%", "OR", "DR", "FTA", "FGA", "2P%", "OEFG%", "STR*Ra", "HFA*Ra",
  "POSS", "Opp OR/G (TR)", "Opp eFG% (TR)", "Opp 2P% (TR)", "Opp 3P% (TR)", "Opp TO% (TR)", "Opp FTA/FGA (TR)", "FTA/FGA (TR)"];
const IX = Object.fromEntries(ENG.map((n, i) => [n, i]));
export const TIERS = ["S", "A", "B", "C", "D", "F"];

// ------------------------------------------------------------------------------ tier stats (Sim Teams formulas)
export const hashFrac = (x) => { const v = Math.abs(Math.sin(x)) * 43758.5453; return v - Math.floor(v); };
export const posInTier = (seed) => hashFrac(seed * 12.9898 + 78.233);

/** Starting stat line for a team of `tier` with `seed` (Tier Setup ranges, shared-quality mixing, 33-game season totals). */
export function tierStats(tier, seed, S) {
  const n = TIERS.indexOf(tier);
  if (n < 0) throw new Error("unknown tier " + tier);
  const pos = posInTier(seed), basis = S.settings.basisGames, w = S.settings.sharedWeight;
  const v = S.statRanges.map((r, i) => {
    const p = r.rises === "Yes" ? pos : 1 - pos;
    const u = hashFrac(seed * 12.9898 + (26 + i) * 78.233);
    const q = Math.min(1, Math.max(0, w * p + (1 - w) * u));
    return r.min[n] + (r.max[n] - r.min[n]) * q;
  });
  const t = S.tiers[n];
  const out = new Array(24);
  out[IX["Games"]] = basis; out[IX["PPG"]] = v[0]; out[IX["ST"]] = v[1]; out[IX["BL"]] = v[2]; out[IX["TO"]] = v[3];
  out[IX["FT%"]] = v[4]; out[IX["3P%"]] = v[5];
  out[IX["OR"]] = v[6] * basis; out[IX["DR"]] = v[7] * basis; out[IX["FTA"]] = v[8] * basis; out[IX["FGA"]] = v[9] * basis;
  out[IX["REB"]] = (out[IX["OR"]] + out[IX["DR"]]) / basis;
  out[IX["2P%"]] = v[10]; out[IX["OEFG%"]] = v[11];
  out[IX["STR*Ra"]] = t.strLow + pos * (t.strHigh - t.strLow);
  out[IX["HFA*Ra"]] = S.settings.hfa;
  out[IX["POSS"]] = v[12];
  for (let k = 0; k < 6; k++) out[IX["Opp OR/G (TR)"] + k] = v[13 + k];
  out[IX["FTA/FGA (TR)"]] = v[19];
  return out;
}

/** Season Start: carry x last season's final engine line + (1 - carry) x the new tier's line. BL and HFA*Ra always come from the tier. */
export function seasonStart(tierLine, prevFinal, carry) {
  if (!prevFinal || !carry) return tierLine.slice();
  return tierLine.map((t, i) => (i === IX["BL"] || i === IX["HFA*Ra"] || i === IX["Games"] ? t : carry * prevFinal[i] + (1 - carry) * t));
}

/** Tier rating centred so the average team in the league is 0 (depends on how many teams sit in each tier). */
export function centeredTierRatings(tierOf, S) {
  const cnt = Object.fromEntries(TIERS.map((t) => [t, 0]));
  for (const t of tierOf) cnt[t]++;
  const mean = TIERS.reduce((s, t, i) => s + cnt[t] * S.tiers[i].rating, 0) / tierOf.length;
  return Object.fromEntries(TIERS.map((t, i) => [t, S.tiers[i].rating - mean]));
}

// ------------------------------------------------------------------------------ season totals (Sim Season G..AC)
const ZERO = () => ({ G: 0, W: 0, L: 0, confW: 0, confL: 0, PF: 0, PA: 0, FGM: 0, FGA: 0, TPM: 0, TPA: 0, FTM: 0, FTA: 0, OR: 0, DR: 0, TO: 0, ST: 0, POSS: 0,
  oFGM: 0, oFGA: 0, oTPM: 0, oTPA: 0, oFTA: 0, oOR: 0, oTO: 0, oPOSS: 0 });
// box row: [id, OT, FGM,FGA,3PM,3PA,FTM,FTA,OR,DR,TO,ST,POSS (A), same for B]
export function boxSides(b, ptsA, ptsB) {
  const side = (o, pts) => ({ pts, FGM: b[o], FGA: b[o + 1], TPM: b[o + 2], TPA: b[o + 3], FTM: b[o + 4], FTA: b[o + 5], OR: b[o + 6], DR: b[o + 7], TO: b[o + 8], ST: b[o + 9], POSS: b[o + 10] });
  return [side(2, ptsA), side(13, ptsB)];
}
export function accumulate(nTeams, games, boxById) {
  const T = Array.from({ length: nTeams }, ZERO);
  for (const g of games) {
    if (g.ptsA == null) continue;
    const bx = boxById.get(g.id);
    if (!bx) throw new Error(`game ${g.id} has a score but no box score`);
    const [a, b] = boxSides(bx, g.ptsA, g.ptsB);
    const add = (t, own, opp, won, conf) => {
      const r = T[t]; r.G++; won ? r.W++ : r.L++; if (conf) won ? r.confW++ : r.confL++;
      r.PF += own.pts; r.PA += opp.pts; r.FGM += own.FGM; r.FGA += own.FGA; r.TPM += own.TPM; r.TPA += own.TPA; r.FTM += own.FTM; r.FTA += own.FTA;
      r.OR += own.OR; r.DR += own.DR; r.TO += own.TO; r.ST += own.ST; r.POSS += own.POSS;
      r.oFGM += opp.FGM; r.oFGA += opp.FGA; r.oTPM += opp.TPM; r.oTPA += opp.TPA; r.oFTA += opp.FTA; r.oOR += opp.OR; r.oTO += opp.TO; r.oPOSS += opp.POSS;
    };
    const aWon = g.ptsA > g.ptsB, conf = g.type === "Conf";
    add(g.a, a, b, aWon, conf); add(g.b, b, a, !aWon, conf);
  }
  return T;
}

// ------------------------------------------------------------------------------ SRS (RecalcSRS: conjugate gradient)
/** games = played games {a, b, ptsA, ptsB}; prior = per-team tier rating (centred); ramp = pseudo-game count. */
export function solveSRS(nTeams, games, prior, ramp) {
  const sumM = new Float64Array(nTeams), cnt = new Float64Array(nTeams), dg = new Float64Array(nTeams), b = new Float64Array(nTeams);
  const ia = [], ib = [];
  for (const g of games) {
    if (g.ptsA == null) continue;
    ia.push(g.a); ib.push(g.b);
    const m = g.ptsA - g.ptsB;
    sumM[g.a] += m; sumM[g.b] -= m; cnt[g.a]++; cnt[g.b]++;
  }
  const used = ia.length;
  for (let i = 0; i < nTeams; i++) { dg[i] = cnt[i] > ramp ? cnt[i] : ramp; b[i] = sumM[i] + (dg[i] - cnt[i]) * prior[i]; }
  const x = new Float64Array(nTeams), r = Float64Array.from(b), p = Float64Array.from(b), ap = new Float64Array(nTeams);
  const dot = (u, v) => { let s = 0; for (let i = 0; i < nTeams; i++) s += u[i] * v[i]; return s; };
  let rs = dot(r, r);
  for (let it = 0; it < 1000; it++) {
    if (rs < 1e-14) break;
    for (let i = 0; i < nTeams; i++) ap[i] = dg[i] * p[i];
    for (let k = 0; k < used; k++) { ap[ia[k]] -= p[ib[k]]; ap[ib[k]] -= p[ia[k]]; }
    const pap = dot(p, ap);
    if (pap <= 0) break;
    const alpha = rs / pap;
    for (let i = 0; i < nTeams; i++) { x[i] += alpha * p[i]; r[i] -= alpha * ap[i]; }
    const rsNew = dot(r, r), beta = rsNew / rs;
    for (let i = 0; i < nTeams; i++) p[i] = r[i] + beta * p[i];
    rs = rsNew;
  }
  return Array.from(x);
}

// ------------------------------------------------------------------------------ Team Stats (records, rating, SOS, form)
/**
 * @param games   all scheduled games in id order: {id, day, type, a, b, home, ptsA, ptsB}
 * @param srs     SRS per team
 * @param tierRating  per-team centred tier rating
 */
export function teamStats(nTeams, games, srs, tierRating) {
  const S = Array.from(
    { length: nTeams },
    () => ({ GP: 0, W: 0, L: 0, confGP: 0, confW: 0, home: [0, 0], away: [0, 0], neutral: [0, 0], PF: 0, PA: 0, results: [] }));
  for (const g of games) {
    if (g.ptsA == null) continue;
    const aWon = g.ptsA > g.ptsB;
    for (const [t, own, opp, won, isB] of [[g.a, g.ptsA, g.ptsB, aWon, false], [g.b, g.ptsB, g.ptsA, !aWon, true]]) {
      const r = S[t]; r.GP++; won ? r.W++ : r.L++; r.PF += own; r.PA += opp;
      if (g.type === "Conf") { r.confGP++; if (won) r.confW++; }
      const bucket = g.home === 0 ? r.neutral : isB ? r.home : r.away;
      bucket[won ? 0 : 1]++;
      r.results.push({ g, won, opp: isB ? g.a : g.b });
    }
  }
  const rating = S.map((r, i) => (r.GP === 0 ? 0 : srs[i]));
  const eff = S.map((r, i) => (r.GP === 0 ? tierRating[i] : rating[i]));
  const played = S.map((r, i) => (r.GP > 0 ? rating[i] : null)).filter((x) => x !== null);
  return S.map((r, i) => {
    const GP = r.GP, rank = GP === 0 ? null : played.filter((x) => x > rating[i]).length + 1;
    const last = r.results.slice(-10), lw = last.filter((x) => x.won).length;
    let streak = null;
    if (GP) { const lastWon = r.results[GP - 1].won; let k = 0; for (let j = GP - 1; j >= 0 && r.results[j].won === lastWon; j--) k++; streak = (lastWon ? "W" : "L") + k; }
    const sos = GP === 0 ? 0 : r.results.reduce((s, x) => s + eff[x.opp], 0) / GP;
    let best = null, worst = null;
    for (const x of r.results) {
      if (x.won && (best === null || eff[x.opp] > eff[best])) best = x.opp;
      if (!x.won && (worst === null || eff[x.opp] < eff[worst])) worst = x.opp;
    }
    return {
      GP, W: r.W, L: r.L, winPct: GP ? r.W / GP : 0, confGP: r.confGP, confW: r.confW, confL: r.confGP - r.confW,
      confPct: r.confGP ? r.confW / r.confGP : 0,
      home: r.home.join("-"), away: r.away.join("-"), neutral: r.neutral.join("-"),
      PF: r.PF, PA: r.PA, pfpg: GP ? r.PF / GP : 0, papg: GP ? r.PA / GP : 0, margin: GP ? (r.PF - r.PA) / GP : 0,
      rating: rating[i], tierRating: tierRating[i], vsTier: GP ? rating[i] - tierRating[i] : 0, rank, eff: eff[i], sos,
      last10: GP ? `${lw}-${last.length - lw}` : null, streak, bestWin: best, worstLoss: worst,
    };
  });
}

// ------------------------------------------------------------------------------ Sim Season per-game stats (input scale)
/** De-amplify totals back to input scale and adjust for strength of schedule. */
export function simStats(T, sos, srs, S) {
  const C = S.conversion, ref = S.settings.convReference, basis = S.settings.basisGames;
  const conv = (i, raw) => C[i].inMean + (raw - C[i].effect * (sos - ref) - C[i].outMean) / C[i].slope;
  const ratio = (a, b, k = 1) => (b ? (a / b) * k : 0); // IFERROR(a/b, 0)
  const G = T.G;
  if (!G) return new Array(24).fill(0);
  const out = new Array(24).fill(0);
  out[IX["PPG"]] = conv(0, T.PF / G); out[IX["ST"]] = conv(1, T.ST / G); out[IX["TO"]] = conv(2, T.TO / G);
  out[IX["FT%"]] = conv(3, ratio(T.FTM, T.FTA, 100)); out[IX["3P%"]] = conv(4, ratio(T.TPM, T.TPA, 100));
  out[IX["OR"]] = conv(5, T.OR / G) * basis; out[IX["DR"]] = conv(6, T.DR / G) * basis;
  out[IX["FTA"]] = conv(7, T.FTA / G) * basis; out[IX["FGA"]] = conv(8, T.FGA / G) * basis;
  out[IX["REB"]] = (out[IX["OR"]] + out[IX["DR"]]) / basis;
  out[IX["2P%"]] = conv(9, ratio(T.FGM - T.TPM, T.FGA - T.TPA, 100));
  out[IX["OEFG%"]] = conv(10, ratio(T.FGM + 0.5 * T.TPM, T.FGA, 100));
  out[IX["POSS"]] = conv(11, T.POSS / G);
  out[IX["Opp OR/G (TR)"]] = conv(12, T.oOR / G);
  out[IX["Opp eFG% (TR)"]] = conv(13, ratio(T.oFGM + 0.5 * T.oTPM, T.oFGA, 100));
  out[IX["Opp 2P% (TR)"]] = conv(14, ratio(T.oFGM - T.oTPM, T.oFGA - T.oTPA, 100));
  out[IX["Opp 3P% (TR)"]] = conv(15, ratio(T.oTPM, T.oTPA, 100));
  out[IX["Opp TO% (TR)"]] = conv(16, ratio(T.oTO, T.oPOSS, 100));
  out[IX["Opp FTA/FGA (TR)"]] = conv(17, ratio(T.oFTA, T.oFGA));
  out[IX["FTA/FGA (TR)"]] = conv(18, ratio(T.FTA, T.FGA));
  out[IX["STR*Ra"]] = S.settings.strAtZero + S.settings.strPerSrs * srs;
  return out;
}

// ------------------------------------------------------------------------------ Sim Live blend
export function simLive(start, sim, G, S) {
  const w = (1 - S.settings.anchor) * Math.min(1, G / S.settings.ramp);
  return start.map((s, i) => (i === IX["Games"] || i === IX["BL"] || i === IX["HFA*Ra"] ? s : (1 - w) * s + w * sim[i]));
}

// ------------------------------------------------------------------------------ everything for one season state
/**
 * teams: [{id, tier, start[]}] indexed by team id; games: all scheduled games (played ones have ptsA/ptsB);
 * box: Map(gameId -> box row). Returns per-team {totals, srs, stats, sim, live}.
 */
export function computeSeason({ teams, games, box, S }) {
  const n = teams.length;
  const tierRatingByTier = centeredTierRatings(teams.map((t) => t.tier), S);
  const tierRating = teams.map((t) => tierRatingByTier[t.tier]);
  const totals = accumulate(n, games, box);
  const srs = solveSRS(n, games, tierRating, S.settings.ramp);
  const stats = teamStats(n, games, srs, tierRating);
  const out = teams.map((t, i) => {
    const sim = simStats(totals[i], stats[i].sos, srs[i], S);
    return { totals: totals[i], srs: srs[i], stats: stats[i], sim, live: simLive(t.start, sim, totals[i].G, S) };
  });
  return { teams: out, tierRatingByTier };
}
