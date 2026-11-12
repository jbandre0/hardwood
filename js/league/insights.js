// Weekly insights: the numbers behind the articles. Everything here is computed from the season state; nothing is
// written by hand. Two kinds of forecast are used and labelled as such:
//  - "engine" what-ifs: the real v9 engine (predict(), 10,000 games) for a handful of hypothetical matchups;
//  - "quick model" projections for the rest of the season: each remaining game's margin ~ Normal(rating gap + home
//    edge, 13.5), the engine's own margin spread (see the known weaknesses). Fast enough to run thousands of seasons.
import { computeSeason } from "./stats.js";
import { makeRng, predict } from "../engine.js";
import { engineRow } from "./league.js";

export const POWER_CONFS = ["ACC", "Big 10", "Big 12", "SEC", "Big East"];
export const QUICK_SD = 13.5;

const played = (g) => g.ptsA != null;
const winnerOf = (g) => (g.ptsA > g.ptsB ? g.a : g.b);
const loserOf = (g) => (g.ptsA > g.ptsB ? g.b : g.a);
const isRegular = (g) => g.type === "Reg" || g.type === "Conf";

/** normal CDF (Abramowitz-Stegun 7.1.26), accurate to ~1e-7 */
export function phi(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 1 - 0.5 * (1 + y);
}

/** team stats (ratings, records) using only games played on or before `day` */
export function statsAsOf(state, day) {
  const games = state.games.map((g) => (g.day <= day ? g : { ...g, ptsA: null, ptsB: null }));
  return computeSeason({ teams: state.data.teams, games, box: state.box, S: state.S }).teams.map((t) => t.stats);
}

/** home edge in points for team `id` in game g (b hosts when home=1) */
const homeEdge = (g, id, hfa) => (g.home === 0 ? 0 : id === g.b ? hfa : -hfa);

/**
 * All the week's insights. from/to = day window for "this week" (inclusive), usually the days since the last ballot.
 * Returns plain data; draftArticle() turns it into prose.
 */
export function weeklyInsights(state, c, { from, to, sims = 2000, seed = 1, whatIfs = true, engineSims = 10000 } = {}) {
  const L = state.data.league, T = state.data.teams, n = L.length, hfa = state.S.settings.hfa || 3.7;
  const now = c.teams.map((t) => t.stats), before = statsAsOf(state, from - 1);
  const name = (id) => L[id].name;
  const all = state.games.filter(played), week = all.filter((g) => g.day >= from && g.day <= to);
  const reg = all.filter(isRegular);
  const out = { from, to, days: to, games: all.length, weekGames: week.length };

  // ---- the big picture
  const unbeaten = now.map((s, id) => ({ id, s })).filter((x) => x.s.GP > 0 && x.s.L === 0).sort((a, b) => b.s.W - a.s.W || b.s.rating - a.s.rating);
  const unbeatenBefore = before.filter((s) => s.GP > 0 && s.L === 0).length;
  const winless = now.map((s, id) => ({ id, s })).filter((x) => x.s.GP > 0 && x.s.W === 0).sort((a, b) => b.s.L - a.s.L);
  out.unbeaten = { count: unbeaten.length, before: unbeatenBefore, power: unbeaten.filter((x) => POWER_CONFS.includes(T[x.id].conf)).length,
    teams: unbeaten.slice(0, 12).map((x) => ({ id: x.id, name: name(x.id), w: x.s.W, rating: x.s.rating, conf: T[x.id].conf })) };
  out.winless = { count: winless.length, teams: winless.slice(0, 6).map((x) => ({ id: x.id, name: name(x.id), l: x.s.L })) };

  // ---- the week's games: upsets (judged by the ratings going into the week), blowouts, overtime, shootouts
  const exp = (g, id, other) => before[id].eff - before[other].eff + homeEdge(g, id, hfa);
  const graded = week.map((g) => {
    const w = winnerOf(g), l = loserOf(g), e = exp(g, w, l);
    return { g, w, l, e, pWin: phi(e / QUICK_SD), margin: Math.abs(g.ptsA - g.ptsB), total: g.ptsA + g.ptsB, ot: (state.box.get(g.id) || [])[1] || 0 };
  });
  const upsets = graded.filter((x) => x.e < 0).sort((a, b) => a.pWin - b.pWin);
  const fmtG = (x) => ({ id: x.g.id, day: x.g.day, type: x.g.type, ctx: x.g.ctx, winner: x.w, loser: x.l, winnerName: name(x.w), loserName: name(x.l),
    score: `${Math.max(x.g.ptsA, x.g.ptsB)}-${Math.min(x.g.ptsA, x.g.ptsB)}`, pWin: x.pWin, expected: x.e, margin: x.margin, ot: x.ot, total: x.total,
    winnerHome: x.g.home !== 0 && x.w === x.g.b, loserHome: x.g.home !== 0 && x.l === x.g.b, neutral: x.g.home === 0 });
  out.upsets = upsets.slice(0, 5).map(fmtG);
  out.upsetCount = { total: upsets.length, big: upsets.filter((x) => x.pWin < 0.2).length };
  out.overtime = graded.filter((x) => x.ot > 0).sort((a, b) => b.ot - a.ot).slice(0, 4).map(fmtG);
  out.otCount = graded.filter((x) => x.ot > 0).length;
  out.shootout = graded.length ? fmtG(graded.reduce((m, x) => (x.total > m.total ? x : m))) : null;
  out.blowout = graded.length ? fmtG(graded.reduce((m, x) => (x.margin > m.margin ? x : m))) : null;
  out.leagueScoring = all.length ? all.reduce((s, g) => s + g.ptsA + g.ptsB, 0) / (2 * all.length) : 0;
  const homeGames = reg.filter((g) => g.home !== 0);
  out.homeWinPct = homeGames.length ? homeGames.filter((g) => g.ptsB > g.ptsA).length / homeGames.length : null;

  // ---- risers and fallers (rating change over the window, teams with games both sides)
  const moves = now.map((s, id) => ({ id, d: s.rating - before[id].rating, s, b: before[id] })).filter((x) => x.s.GP >= 3 && x.b.GP >= 1);
  moves.sort((a, b) => b.d - a.d);
  const mv = (x) => ({ id: x.id, name: name(x.id), delta: x.d, rating: x.s.rating, rank: x.s.rank, rankBefore: x.b.rank, rec: `${x.s.W}-${x.s.L}` });
  // the ones people care about: risers who are now in the top 60, fallers who were in the top 40 (fallback: anyone)
  const rel = moves.filter((x) => x.s.rank <= 60 && x.d > 0), relF = moves.filter((x) => x.b.rank <= 40 && x.d < 0);
  out.risers = (rel.length >= 2 ? rel : moves).slice(0, 4).map(mv);
  out.fallers = (relF.length >= 2 ? relF : moves).slice(-4).reverse().map(mv);

  // ---- luck: actual wins vs Pythagorean expectation (exponent 11.5, a standard college value)
  const K = 11.5;
  const luck = now.map((s, id) => {
    if (s.GP < 6) return null;
    const p = s.PF ** K / (s.PF ** K + s.PA ** K), expW = p * s.GP;
    return { id, name: name(id), w: s.W, l: s.L, expW, diff: s.W - expW, gp: s.GP };
  }).filter(Boolean).sort((a, b) => b.diff - a.diff);
  out.luckiest = luck.slice(0, 3); out.unluckiest = luck.slice(-3).reverse();

  // ---- close games (5 points or fewer, or overtime) records, regular season
  const close = new Map();
  for (const g of reg) {
    const ot = (state.box.get(g.id) || [])[1] || 0;
    if (Math.abs(g.ptsA - g.ptsB) > 5 && !ot) continue;
    for (const [id, won] of [[g.a, g.ptsA > g.ptsB], [g.b, g.ptsB > g.ptsA]]) { const r = close.get(id) || { w: 0, l: 0 }; won ? r.w++ : r.l++; close.set(id, r); }
  }
  const cl = [...close].map(([id, r]) => ({ id, name: name(id), ...r, n: r.w + r.l })).filter((x) => x.n >= 3);
  out.clutch = cl.filter((x) => x.l === 0).sort((a, b) => b.w - a.w).slice(0, 3);
  out.cursed = cl.filter((x) => x.w === 0).sort((a, b) => b.l - a.l).slice(0, 3);

  // ---- tier busters: playing far above / below their tier
  const tb = now.map((s, id) => ({ id, name: name(id), tier: T[id].tier, gap: s.rating - s.tierRating, rating: s.rating, rec: `${s.W}-${s.L}`, gp: s.GP })).filter((x) => x.gp >= 5);
  tb.sort((a, b) => b.gap - a.gap);
  out.overachievers = tb.slice(0, 3); out.underachievers = tb.slice(-3).reverse();
  out.blueBloodsInTrouble = tb.filter((x) => (x.tier === "S" || x.tier === "A") && x.gp >= 5 && now[x.id].W < now[x.id].L).map((x) => ({ ...x, conf: T[x.id].conf }));

  // ---- conference power this week vs last (non-conference record + average rating)
  const confAvg = (S) => { const m = new Map(); for (let id = 0; id < n; id++) { const k = T[id].conf, r = m.get(k) || { s: 0, n: 0 }; r.s += S[id].GP ? S[id].rating : S[id].tierRating; r.n++; m.set(k, r); } return [...m].map(([conf, r]) => ({ conf, avg: r.s / r.n })).sort((a, b) => b.avg - a.avg); };
  const cNow = confAvg(now), cBefore = confAvg(before);
  out.confPower = cNow.map((r, i) => ({ ...r, rank: i + 1, rankBefore: cBefore.findIndex((x) => x.conf === r.conf) + 1 }));

  // ---- projections for the rest of the regular season (quick model, Monte Carlo)
  const left = state.games.filter((g) => isRegular(g) && !played(g));
  const proj = projectSeason(state, now, left, { sims, seed, hfa });
  out.projection = proj;

  // ---- hypotheticals with the real engine
  out.whatIfs = [];
  if (whatIfs) {
    const top = [...now.keys()].filter((id) => now[id].GP).sort((a, b) => now[b].rating - now[a].rating);
    const pairs = [];
    if (unbeaten.length >= 2) pairs.push(["The two best unbeaten teams on a neutral floor", unbeaten[0].id, [...unbeaten].sort((a, b) => b.s.rating - a.s.rating).find((x) => x.id !== unbeaten[0].id).id]);
    if (top.length >= 2 && !pairs.some((p) => p[1] === top[0] && p[2] === top[1])) pairs.push(["The top two power ratings, neutral floor", top[0], top[1]]);
    if (out.overachievers[0] && top[0] !== out.overachievers[0].id) pairs.push([`${out.overachievers[0].name} (Tier ${out.overachievers[0].tier}) against the No. 1 team`, out.overachievers[0].id, top[0]]);
    for (const [label, a, b] of pairs.slice(0, 3)) {
      const r = predict(engineRow(state, c, a), engineRow(state, c, b), "neutral", { n: engineSims, seed: 1000 + a * 7 + b, hist: false });
      out.whatIfs.push({ label, a, b, aName: name(a), bName: name(b), pA: r.p, margin: r.margin, scoreA: r.scoreA, scoreB: r.scoreB, sims: engineSims });
    }
  }
  return out;
}

/**
 * Monte Carlo of the remaining regular season with the quick model. Returns projected wins, chances to finish
 * unbeaten, and each conference's regular-season title odds (ties shared).
 */
export function projectSeason(state, now, left, { sims = 2000, seed = 1, hfa = 3.7 } = {}) {
  const T = state.data.teams, L = state.data.league, n = L.length, rand = makeRng(seed);
  const pB = left.map((g) => phi((now[g.b].eff - now[g.a].eff + (g.home === 0 ? 0 : hfa)) / QUICK_SD));
  const winsSum = new Float64Array(n), unbeatenEnd = new Float64Array(n), confTitle = new Float64Array(n);
  const baseW = now.map((s) => s.W), baseL = now.map((s) => s.L), baseCW = now.map((s) => s.confW), baseCL = now.map((s) => s.confL);
  const confs = new Map(); for (let id = 0; id < n; id++) { const k = T[id].conf; if (!confs.has(k)) confs.set(k, []); confs.get(k).push(id); }
  const w = new Int32Array(n), l = new Int32Array(n), cw = new Int32Array(n), clz = new Int32Array(n);
  for (let s = 0; s < sims; s++) {
    for (let id = 0; id < n; id++) { w[id] = baseW[id]; l[id] = baseL[id]; cw[id] = baseCW[id]; clz[id] = baseCL[id]; }
    for (let i = 0; i < left.length; i++) {
      const g = left[i], bWins = rand() < pB[i], win = bWins ? g.b : g.a, lose = bWins ? g.a : g.b;
      w[win]++; l[lose]++;
      if (g.type === "Conf") { cw[win]++; clz[lose]++; }
    }
    for (let id = 0; id < n; id++) { winsSum[id] += w[id]; if (l[id] === 0) unbeatenEnd[id]++; }
    for (const ids of confs.values()) {
      let best = -1, tied = [];
      for (const id of ids) { const p = cw[id] / Math.max(1, cw[id] + clz[id]); if (p > best + 1e-12) { best = p; tied = [id]; } else if (Math.abs(p - best) < 1e-12) tied.push(id); }
      for (const id of tied) confTitle[id] += 1 / tied.length;
    }
  }
  const teams = L.map((t, id) => ({ id, name: t.name, conf: T[id].conf, projW: winsSum[id] / sims, games: baseW[id] + baseL[id] + left.filter((g) => g.a === id || g.b === id).length,
    pUnbeaten: unbeatenEnd[id] / sims, pConf: confTitle[id] / sims }));
  const races = [...confs.keys()].map((conf) => {
    const rows = teams.filter((t) => t.conf === conf).sort((a, b) => b.pConf - a.pConf);
    const top = rows[0], second = rows[1];
    return { conf, favorite: top, second, spread: top.pConf - (second ? second.pConf : 0), contenders: rows.filter((r) => r.pConf >= 0.1).length };
  }).sort((a, b) => a.spread - b.spread);
  return { sims, gamesLeft: left.length, teams, races, unbeatenOdds: teams.filter((t) => t.pUnbeaten > 0).sort((a, b) => b.pUnbeaten - a.pUnbeaten).slice(0, 8) };
}

// ------------------------------------------------------------------------------------------------- article writer
const pct = (p) => (p >= 0.995 ? ">99%" : p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
const oneIn = (p) => (p > 0 ? Math.max(2, Math.round(1 / p)) : null);
const sgn = (x, d = 1) => (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(d);
const listAnd = (a) => (a.length <= 1 ? a.join("") : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const ord = (k) => { const s = ["th", "st", "nd", "rd"], v = k % 100; return k + (s[(v - 20) % 10] || s[v] || s[0]); };
const venue = (u) => (u.neutral ? "on a neutral floor" : u.winnerHome ? "at home" : "on the road");

/**
 * Turn weeklyInsights() into a draft article: headline + body in the site's article format (ALL-CAPS section
 * headings on their own line, blank lines between paragraphs). The commissioner edits it before publishing.
 */
export function draftArticle(ins, { week, label } = {}) {
  const S = [], heads = [];
  const lead = ins.unbeaten.teams[0];
  S.push(`Good morning from Bracketology HQ. ${ins.to} days and ${ins.games.toLocaleString()} games are in${ins.weekGames ? `, ${ins.weekGames.toLocaleString()} of them since the last update` : ""}. Here is what the numbers say, including a few things that shouldn't be happening.`);

  // the big story: the unbeaten list
  const u = ins.unbeaten;
  if (u.count) {
    const drop = u.before - u.count;
    S.push(`THE UNBEATEN LIST\n${u.count} team${u.count === 1 ? " is" : "s are"} still perfect${drop > 0 ? `, down from ${u.before} a week ago` : ""}. ${u.power} of them come from the ACC, Big 10, Big 12, SEC and Big East. ${u.count <= 12 ? `The list: ${listAnd(u.teams.map((t) => `${t.name} (${t.w}-0)`))}.` : `The longest runs belong to ${listAnd(u.teams.slice(0, 5).map((t) => `${t.name} (${t.w}-0)`))}.`}`);
    const odds = ins.projection.unbeatenOdds.filter((t) => t.pUnbeaten >= 0.01);
    if (odds.length) S.push(`Can anyone finish the regular season unbeaten? The quick model plays out the remaining ${ins.projection.gamesLeft.toLocaleString()} games ${ins.projection.sims.toLocaleString()} times. ${odds[0].name} runs the table in ${pct(odds[0].pUnbeaten)} of those seasons${odds.length > 1 ? `, ${listAnd(odds.slice(1, 4).map((t) => `${t.name} in ${pct(t.pUnbeaten)}`))}` : ""}. ${odds[0].pUnbeaten < 0.25 ? "In other words, enjoy it while it lasts." : odds[0].pUnbeaten > 0.5 ? `For ${odds[0].name} the perfect season is the likelier outcome, which tells you how far ahead of its schedule it is.` : "That is a real chance, not a fantasy."}`);
    else if (ins.projection.gamesLeft) S.push("The quick model gives nobody even a 1% chance of finishing the regular season perfect. Somebody is going to lose, probably soon.");
    heads.push(drop > 0 ? `the Unbeaten List Drops to ${u.count}` : `${u.count} Teams Still Perfect`);
  }

  // upset of the week
  const up = ins.upsets[0];
  if (up) {
    const n = oneIn(up.pWin);
    S.push(`UPSET OF THE WEEK\n${up.winnerName} beat ${up.loserName} ${up.score} ${venue(up)} on day ${up.day}${up.ot ? ` in ${up.ot === 1 ? "overtime" : up.ot + " overtimes"}` : ""}. Going into the week the ratings had ${up.loserName} by ${Math.abs(up.expected).toFixed(1)} points, which makes this roughly a 1-in-${n} result. ${ins.upsetCount.total > 1 ? `It was one of ${ins.upsetCount.total} upsets this week${ins.upsetCount.big > 1 ? `, ${ins.upsetCount.big} of them by teams given less than a 20% chance` : ""}.` : ""}`);
    if (ins.upsets.length > 1) S.push(`Also worth a look: ${listAnd(ins.upsets.slice(1, 4).map((x) => `${x.winnerName} over ${x.loserName} (${x.score}, ${pct(x.pWin)} going in)`))}.`);
    heads.push(`${up.winnerName} Stuns ${up.loserName}`);
  }

  // risers and fallers
  if (ins.risers.length) {
    const r = ins.risers[0], f = ins.fallers[0];
    S.push(`RISERS AND FALLERS\nThe biggest mover is ${r.name}, up ${r.delta.toFixed(1)} rating points to ${r.rating.toFixed(1)} (${r.rec}, now ${ord(r.rank)}). ${ins.risers.length > 1 ? `${listAnd(ins.risers.slice(1, 3).map((x) => `${x.name} (${sgn(x.delta)})`))} also climbed.` : ""} Going the other way: ${f.name} lost ${Math.abs(f.delta).toFixed(1)} points and sits ${ord(f.rank)} at ${f.rec}${ins.fallers.length > 1 ? `, with ${listAnd(ins.fallers.slice(1, 3).map((x) => `${x.name} (${sgn(x.delta)})`))} close behind` : ""}.`);
  }

  // the strange stuff
  const odd = [];
  if (ins.overachievers[0] && ins.overachievers[0].gap >= 8) { const o = ins.overachievers[0]; odd.push(`${o.name} is a Tier ${o.tier} team playing ${o.gap.toFixed(1)} points better than its tier (${o.rec}, rating ${o.rating.toFixed(1)}). If that holds through March, the tier review will have a decision to make.`); heads.push(`${o.name} Is Playing Above Its Tier`); }
  if (ins.blueBloodsInTrouble.length) odd.push(`Trouble on the top shelf: ${listAnd(ins.blueBloodsInTrouble.slice(0, 3).map((x) => `${x.name} (Tier ${x.tier}, ${x.rec})`))} ${ins.blueBloodsInTrouble.length === 1 ? "is" : "are"} under .500.`);
  if (ins.luckiest[0] && ins.luckiest[0].diff >= 1.5) { const k = ins.luckiest[0]; odd.push(`The luckiest team in the country is ${k.name}. Its points for and against say it should be about ${k.expW.toFixed(1)}-${(k.gp - k.expW).toFixed(1)}; it is ${k.w}-${k.l}.`); }
  if (ins.unluckiest[0] && ins.unluckiest[0].diff <= -1.5) { const k = ins.unluckiest[0]; odd.push(`${k.name} is the opposite case: ${k.w}-${k.l} with the scoring margin of a ${k.expW.toFixed(1)}-win team. Expect that to even out.`); }
  if (ins.clutch[0]) odd.push(`${ins.clutch[0].name} is ${ins.clutch[0].w}-0 in games decided by five points or fewer or in overtime.${ins.cursed[0] ? ` ${ins.cursed[0].name} is 0-${ins.cursed[0].l} in the same kind of game.` : ""}`);
  if (ins.shootout && ins.shootout.total >= 190) odd.push(`Highest-scoring game of the week: ${ins.shootout.winnerName} ${ins.shootout.score} over ${ins.shootout.loserName}, ${ins.shootout.total} points${ins.shootout.ot ? " with overtime help" : ""}.`);
  if (ins.otCount >= 3) odd.push(`${ins.otCount} games went to overtime this week${ins.overtime[0] && ins.overtime[0].ot > 1 ? `, including ${ins.overtime[0].winnerName} over ${ins.overtime[0].loserName} in ${ins.overtime[0].ot} overtimes` : ""}.`);
  if (odd.length) S.push(`THINGS THAT SHOULDN'T BE HAPPENING\n${odd.join(" ")}`);

  // hypotheticals with the engine
  if (ins.whatIfs.length) {
    const lines = ins.whatIfs.map((w) => `${w.label}: ${w.aName} wins ${pct(w.pA)} of ${w.sims.toLocaleString()} simulated games, by ${Math.abs(w.margin).toFixed(1)} on average${w.pA < 0.5 ? " the other way" : ""} (typical score ${Math.round(w.scoreA)}-${Math.round(w.scoreB)}).`);
    S.push(`WHAT IF\nThe schedule won't give us these games, so I ran them through the engine. ${lines.join(" ")}`);
  }

  // conference races
  const races = ins.projection.races.filter((r) => r.contenders >= 2).slice(0, 3);
  if (races.length) {
    S.push(`CONFERENCE RACES\nThe tightest regular-season title races, by the quick model: ${races.map((r) => `in the ${r.conf}, ${r.favorite.name} wins or shares it ${pct(r.favorite.pConf)} of the time and ${r.second.name} ${pct(r.second.pConf)}`).join("; ")}.`);
  }
  const cp = ins.confPower.filter((r) => r.rankBefore && r.rank !== r.rankBefore).sort((a, b) => Math.abs(b.rank - b.rankBefore) - Math.abs(a.rank - a.rankBefore))[0];
  if (cp) S.push(`${cp.conf} moved from ${ord(cp.rankBefore)} to ${ord(cp.rank)} in the conference power order (average rating ${sgn(cp.avg)}). The top three right now: ${listAnd(ins.confPower.slice(0, 3).map((r) => r.conf))}.`);

  // where this is headed
  if (ins.projection.gamesLeft) {
    const best = [...ins.projection.teams].sort((a, b) => b.projW - a.projW).slice(0, 3);
    S.push(`WHERE THIS IS HEADED\nProjected final regular-season records for the top of the board: ${listAnd(best.map((t) => `${t.name} ${t.projW.toFixed(1)}-${(t.games - t.projW).toFixed(1)}`))}. ${lead ? (lead.id === best[0].id ? `${lead.name} has the longest perfect run and the ratings agree it is the team to beat.` : `${lead.name} has the longest perfect run, but the ratings say the team to beat is ${best[0].name}.`) : ""} These projections use a quick model (rating gap plus home edge, with the engine's spread of about ${QUICK_SD} points), not 40,000 engine sims per game, so treat them as a direction, not a promise.`);
  }
  S.push(`League scoring is running at ${ins.leagueScoring.toFixed(1)} points per team per game${ins.homeWinPct != null ? `, and home teams are winning ${pct(ins.homeWinPct)} of the time` : ""}. See you next week.`);

  const headline = `${label || (week != null ? `Week ${week}` : "This Week")}: ${listAnd(heads.slice(0, 3)) || "The Numbers Behind the Week"}`;
  return { headline, body: S.join("\n\n") };
}
