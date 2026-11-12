// Recap of one finished day: results, upsets (judged by the ratings going into the day), power-ranking movement.
import { statsAsOf, phi, QUICK_SD } from "./insights.js";


export const dayDone = (state, day) => state.games.some((g) => g.day === day) && !state.games.some((g) => g.day === day && g.ptsA == null);

export function dayRecap(state, day) {
  const now = statsAsOf(state, day), before = statsAsOf(state, day - 1), L = state.data.league, hfa = state.S.settings.hfa || 3.7;
  const games = state.games.filter((g) => g.day === day && g.ptsA != null).map((g) => {
    const w = g.ptsA > g.ptsB ? g.a : g.b, l = w === g.a ? g.b : g.a;
    const edge = g.home === 0 ? 0 : w === g.b ? hfa : -hfa;
    const exp = before[w].eff - before[l].eff + edge;
    return { id: g.id, type: g.type, ctx: g.ctx, a: g.a, b: g.b, ptsA: g.ptsA, ptsB: g.ptsB, home: g.home, w, l, margin: Math.abs(g.ptsA - g.ptsB),
      ot: (state.box.get(g.id) || [])[1] || 0, pWin: phi(exp / QUICK_SD), expected: exp };
  });
  const rankOf = (S) => { const order = S.map((s, id) => ({ id, s })).filter((x) => x.s.GP).sort((x, y) => y.s.rating - x.s.rating); const m = new Map(); order.forEach((x, i) => m.set(x.id, i + 1)); return m; };
  const rNow = rankOf(now), rBefore = rankOf(before);
  const top25 = [...rNow].filter(([, r]) => r <= 25).sort((x, y) => x[1] - y[1]).map(([id, r]) => ({ id, rank: r, prev: rBefore.get(id) ?? null, rating: now[id].rating, delta: now[id].rating - (before[id].GP ? before[id].rating : now[id].tierRating), rec: `${now[id].W}-${now[id].L}`, playedToday: games.some((g) => g.a === id || g.b === id) }));
  const moves = games.flatMap((g) => [g.a, g.b]).map((id) => ({ id, name: L[id].name, rank: rNow.get(id), prev: rBefore.get(id) ?? null, delta: now[id].rating - before[id].rating, rec: `${now[id].W}-${now[id].L}` })).filter((x) => x.prev != null && before[x.id].GP >= 2);
  moves.sort((x, y) => y.delta - x.delta);
  const unbeatenNow = now.filter((s) => s.GP && s.L === 0).length, unbeatenBefore = before.filter((s) => s.GP && s.L === 0).length;
  const fellUnbeaten = games.filter((g) => before[g.l].GP && before[g.l].L === 0).map((g) => ({ id: g.l, name: L[g.l].name, by: L[g.w].name, rec: `${now[g.l].W}-${now[g.l].L}` }));
  const nextDay = state.games.filter((g) => g.ptsA == null && g.a != null).reduce((m, g) => Math.min(m, g.day), Infinity);
  return {
    day, games, upsets: games.filter((g) => g.pWin < 0.5).sort((x, y) => x.pWin - y.pWin),
    overtime: games.filter((g) => g.ot), blowout: games.reduce((m, g) => (!m || g.margin > m.margin ? g : m), null),
    closest: games.reduce((m, g) => (!m || g.margin < m.margin ? g : m), null), highest: games.reduce((m, g) => (!m || g.ptsA + g.ptsB > m.ptsA + m.ptsB ? g : m), null),
    top25, risers: moves.slice(0, 5), fallers: moves.slice(-5).reverse(), unbeatenNow, unbeatenBefore, fellUnbeaten,
    nextDay: Number.isFinite(nextDay) ? nextDay : null, nextGames: Number.isFinite(nextDay) ? state.games.filter((g) => g.day === nextDay && g.ptsA == null).length : 0,
    homeRecord: (() => { const h = games.filter((g) => g.home !== 0); return `${h.filter((g) => g.w === g.b).length}-${h.filter((g) => g.w === g.a).length}`; })(),
  };
}
