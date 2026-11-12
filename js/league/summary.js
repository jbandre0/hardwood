// One season boiled down to the rows the workbook archives (Titles, MM Results, MM Games, Season Stats), computed from
// the games themselves so a season played on this site archives exactly like Season 1 did in Excel.
export const ROUNDS = ["First Four", "First Round", "Second Round", "Sweet 16", "Elite Eight", "Final Four", "Championship"];
export const RESULT_BY_LAST = ["First Four", "Round of 64", "Round of 32", "Sweet 16", "Elite Eight", "Final Four", "Runner-up"];
const roundNo = (day) => day - 48;   // day 48 = First Four (0) ... day 54 = Championship (6)

/**
 * @param {object} state  league state (games, content)
 * @param {object} c      calc(state)
 * @param {object[]} L    league.json (names)
 * @param {object[]} field NCAA field [{team, seed, region, ff}]
 */
export function seasonSummary(state, c, L, field = []) {
  const teamsData = state.data.teams, n = L.length;
  const seed = new Map(field.map((f) => [f.team, f]));
  const games = state.games;
  // NCAA games
  const ncaa = games.filter((g) => g.type === "NCAA" && g.ptsA != null).sort((x, y) => x.id - y.id).map((g) => {
    const w = g.ptsA > g.ptsB ? g.a : g.b, l = w === g.a ? g.b : g.a;
    const sA = seed.get(g.a)?.seed ?? null, sB = seed.get(g.b)?.seed ?? null, sw = w === g.a ? sA : sB, sl = w === g.a ? sB : sA;
    return { id: g.id, day: g.day, roundNo: roundNo(g.day), round: ROUNDS[roundNo(g.day)], region: g.ctx, a: g.a, b: g.b, seedA: sA, seedB: sB,
      ptsA: g.ptsA, ptsB: g.ptsB, w, l, seedW: sw, seedL: sl, margin: Math.abs(g.ptsA - g.ptsB), upset: sw != null && sl != null && sw > sl };
  });
  const tw = new Map(), tl = new Map(), last = new Map();
  for (const g of ncaa) { tw.set(g.w, (tw.get(g.w) || 0) + 1); tl.set(g.l, (tl.get(g.l) || 0) + 1); last.set(g.w, g.roundNo); last.set(g.l, g.roundNo); }
  const title = ncaa.find((g) => g.day === 54) || null;
  const ncaaResult = (id) => {
    if (!seed.has(id) || !last.has(id)) return null;
    if (title && id === title.w) return "Champion";
    if (!tl.has(id)) return null;                    // still alive
    return RESULT_BY_LAST[last.get(id)];
  };
  // conference tournaments: champion / runner-up from the day-47 final
  const ctRes = new Map();
  for (const g of games) if (g.type === "CT" && g.day === 47 && g.ptsA != null) { const w = g.ptsA > g.ptsB ? g.a : g.b; ctRes.set(w, "Champion"); ctRes.set(w === g.a ? g.b : g.a, "Runner-up"); }
  const ap = state.content.ap || [], finalAP = new Map((ap.length ? ap[ap.length - 1].ranks : []).map((id, i) => [id, i + 1]));
  const teams = [];
  for (let id = 0; id < n; id++) {
    const s = c.teams[id].stats, f = seed.get(id);
    teams.push({ id, name: L[id].name, conf: teamsData[id].conf, tier: teamsData[id].tier, rank: s.rank, GP: s.GP, W: s.W, L: s.L, winPct: s.winPct,
      confW: s.confW, confL: s.confL, pfpg: s.pfpg, papg: s.papg, margin: s.margin, rating: s.rating, sos: s.sos, tierRating: s.tierRating, vsTier: s.vsTier,
      finalAP: finalAP.get(id) ?? null, confTourney: ctRes.get(id) ?? null, ncaaResult: ncaaResult(id),
      seed: f ? f.seed : null, region: f ? f.region : null, firstFour: f ? !!f.ff : false, tourneyW: tw.get(id) || 0, tourneyL: tl.get(id) || 0,
      lastRound: last.has(id) ? last.get(id) : null, eng: c.teams[id].live });
  }
  const ff = ncaa.filter((g) => g.day === 53);
  const champ = title ? {
    champion: title.w, runnerUp: title.l, score: `${Math.max(title.ptsA, title.ptsB)}-${Math.min(title.ptsA, title.ptsB)}`, margin: title.margin,
    finalFour: ff.flatMap((g) => [g.a, g.b]), upsets: ncaa.filter((g) => g.upset).length,
  } : null;
  const complete = !!title && !games.some((g) => g.ptsA == null);
  return { teams, ncaa, title: champ, complete, ctChampions: [...ctRes].filter(([, r]) => r === "Champion").map(([id]) => id) };
}
