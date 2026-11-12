// Seeded regular-season schedule generator + validator.
//
// Rules (from the workbook's Project Notes 11 and 16, and checked against the real Season 2 schedule):
//  - 30 games per team. Days 1-20 non-conference (type "Reg"), days 21-42 conference (type "Conf").
//  - Conference of 7-11 teams: every rival home and away (2 x (n-1) games).
//    Conference of 12-18: 20 games = everybody once plus 20-(n-1) "doubled" rivals (a symmetric circulant
//    over a shuffled team order), home/away balanced exactly for every team.
//  - Non-conference: random cross-conference opponents, no repeat pairs, and (for new seasons) no repeat of last
//    season's non-conference pairs. Marquee games are guaranteed first and are exempt from the no-repeat rule.
//  - Team A = visitor, Team B = host unless neutral. Never two games for a team on one day.
//  - Games are sorted by day, then host name; ids run 1..N in that order.
//
// NOTE: the original Python script behind the workbook's seeds is not stored in the workbook, so the same seed
// gives a valid schedule of the same shape but NOT the identical schedule. Season 2's real schedule is imported as data.

import { makeRng } from "../engine.js";
import { balanceColors, circleRounds, edgeColor, eulerOrient, shuffle } from "./graph.js";

export const RULES = { gamesPerTeam: 30, nonConfDays: [1, 20], confDays: [21, 42], confGameCap: 20 };
export const pairKey = (a, b) => (a < b ? a * 10000 + b : b * 10000 + a);
const range = (lo, hi) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

// ---------------------------------------------------------------------------------------------------- conference play
function scheduleConference(members, rand, dayPool, load) {
  const n = members.length, ids = shuffle(members, rand), games = [];
  const cap = RULES.confGameCap;
  const take = (rounds) => { // assign each round (list of games) a distinct day from the pool
    if (rounds.length > dayPool.length) throw new Error(`conference of ${n} needs ${rounds.length} days but only ${dayPool.length} exist`);
    // prefer the days other conferences have used least, so every day ends up with a similar number of games
    const order = shuffle(dayPool, rand).sort((x, y) => load[x] - load[y]).slice(0, rounds.length);
    const days = shuffle(order, rand), bySize = rounds.map((r, i) => i).sort((x, y) => rounds[y].length - rounds[x].length);
    const lightFirst = days.slice().sort((x, y) => load[x] - load[y]);   // biggest rounds go to the lightest days
    bySize.forEach((ri, k) => { const d = lightFirst[k]; rounds[ri].forEach((g) => games.push({ day: d, type: "Conf", a: g.a, b: g.b })); load[d] += rounds[ri].length; });
  };
  if (2 * (n - 1) <= cap) {
    const base = circleRounds(n), rounds = [];
    for (const r of base) {
      rounds.push(r.map(([x, y]) => ({ b: ids[x], a: ids[y] })));          // leg 1: x hosts y
      rounds.push(r.map(([x, y]) => ({ b: ids[y], a: ids[x] })));          // leg 2: y hosts x
    }
    take(shuffle(rounds, rand));
    return games;
  }
  const k = cap - (n - 1);                      // doubled rivals per team
  const offs = [];
  const mid = n % 2 === 0 ? n / 2 : null;
  const pool = range(1, Math.floor((n - 1) / 2)).filter((d) => d !== mid);
  const m = Math.floor(k / 2);
  if (m > pool.length) throw new Error(`cannot pick ${m} circulant offsets for a conference of ${n}`);
  offs.push(...shuffle(pool, rand).slice(0, m));
  if (k % 2 === 1) { if (mid === null) throw new Error(`odd doubled-rival count needs an even conference (n=${n})`); offs.push(mid); }
  const doubled = new Set();
  for (let i = 0; i < n; i++) for (const d of offs) doubled.add(pairKey(i, (i + d) % n));
  const baseRounds = circleRounds(n);
  // orientation of single pairs: Euler trail balance (every degree is even, so each team ends exactly even)
  const singles = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (!doubled.has(pairKey(i, j))) singles.push([i, j]);
  const dir = eulerOrient(n, singles), host = new Map();                    // pairKey -> host index
  singles.forEach(([u, v], i) => host.set(pairKey(u, v), dir[i] ? v : u));
  const rounds = [];
  for (const r of baseRounds) rounds.push(r.map(([x, y]) => {
    const h = doubled.has(pairKey(x, y)) ? x : host.get(pairKey(x, y));
    return { b: ids[h], a: ids[h === x ? y : x] };
  }));
  // second games of doubled pairs: colour them into extra rounds, with home/away reversed relative to game 1
  const hostOfFirst = new Map();
  for (const r of baseRounds) for (const [x, y] of r) if (doubled.has(pairKey(x, y))) hostOfFirst.set(pairKey(x, y), x);
  const extra = [...doubled].map((key) => [Math.floor(key / 10000), key % 10000]);
  const colors = edgeColor(n, extra, { rand, limit: dayPool.length - baseRounds.length });
  const extraRounds = new Map();
  extra.forEach(([u, v], i) => {
    const first = hostOfFirst.get(pairKey(u, v)), second = first === u ? v : u;
    if (!extraRounds.has(colors[i])) extraRounds.set(colors[i], []);
    extraRounds.get(colors[i]).push({ b: ids[second], a: ids[first] });
  });
  for (const list of extraRounds.values()) rounds.push(list);
  take(shuffle(rounds, rand));
  return games;
}

// ---------------------------------------------------------------------------------------------- non-conference pairing
function pairNonConference({ teamIds, conf, need, forbidden, rand }) {
  const ok = (u, v, adj) => u !== v && conf[u] !== conf[v] && !adj[u].has(v) && !forbidden.has(pairKey(u, v));
  for (let attempt = 0; attempt < 400; attempt++) {
    const adj = {}; for (const t of teamIds) adj[t] = new Set();
    const edges = [];
    const link = (u, v) => { adj[u].add(v); adj[v].add(u); edges.push([u, v]); };
    const unlink = (idx) => { const [u, v] = edges[idx]; adj[u].delete(v); adj[v].delete(u); edges.splice(idx, 1); };
    let stubs = [];
    for (const t of teamIds) for (let i = 0; i < need[t]; i++) stubs.push(t);
    stubs = shuffle(stubs, rand);
    const stuck = [];
    while (stubs.length) {
      const u = stubs.pop();
      let found = -1; const start = Math.floor(rand() * Math.max(1, stubs.length));
      for (let s = 0; s < stubs.length; s++) { const j = (start + s) % stubs.length; if (ok(u, stubs[j], adj)) { found = j; break; } }
      if (found < 0) { stuck.push(u); continue; }
      const v = stubs[found]; stubs.splice(found, 1); link(u, v);
    }
    // repair: switch edges to absorb stuck stubs
    let guard = 0;
    while (stuck.length && guard++ < 5000) {
      if (stuck.length >= 2) { // two different stuck teams that can now be linked directly
        const u = stuck[stuck.length - 1];
        const k = stuck.findIndex((v, i) => i < stuck.length - 1 && ok(u, v, adj));
        if (k >= 0) { const v = stuck[k]; stuck.splice(k, 1); stuck.pop(); link(u, v); continue; }
      }
      const u = stuck[stuck.length - 1];
      const other = stuck.length >= 2 ? stuck[stuck.length - 2] : null;
      let done = false;
      const idxs = shuffle(edges.map((_, i) => i), rand);
      for (const ei of idxs) {
        const [x, y] = edges[ei];
        if (other !== null) {
          for (const [p, q] of [[x, y], [y, x]]) {
            if (ok(u, p, adj) && ok(other, q, adj) && u !== q && other !== p) { unlink(ei); link(u, p); link(other, q); stuck.pop(); stuck.pop(); done = true; break; }
          }
        } else if (ok(u, x, adj) && ok(u, y, adj) && x !== y) { // one team two stubs short: break an edge and join both ends to u
          unlink(ei); link(u, x); link(u, y); stuck.pop(); done = true;
        }
        if (done) break;
      }
      if (!done) break;
    }
    if (!stuck.length) return edges;
  }
  throw new Error("non-conference pairing failed after 400 attempts");
}

// reverse directed paths so each team's (home - away) comes as close to 0 as the fixed marquee games allow
function balanceHomeAway(teamIds, games, rand) {
  const imb = (t) => games.reduce((s, g) => (g.home ? (g.b === t ? s + 1 : g.a === t ? s - 1 : s) : s), 0);
  const bal = new Map(teamIds.map((t) => [t, imb(t)]));
  for (let round = 0; round < 400; round++) {
    const hi = teamIds.filter((t) => bal.get(t) >= 2), lo = new Set(teamIds.filter((t) => bal.get(t) <= -2));
    if (!hi.length || !lo.size) break;
    let moved = false;
    for (const a of shuffle(hi, rand)) {
      // BFS from a over free games currently hosted by the vertex we stand on
      const prev = new Map([[a, null]]), q = [a];
      let target = null;
      while (q.length && target === null) {
        const cur = q.shift();
        for (const g of games) {
          if (!g.free || !g.home || g.b !== cur) continue;
          const nxt = g.a; if (prev.has(nxt)) continue;
          prev.set(nxt, g); if (lo.has(nxt)) { target = nxt; break; } q.push(nxt);
        }
      }
      if (target === null) continue;
      const path = [];
      for (let v = target; prev.get(v);) { const g = prev.get(v); path.push(g); v = g.b; } // g.b is the host we came from
      for (const g of path) [g.a, g.b] = [g.b, g.a];
      // flipping moved 2 units of home from a to target
      bal.set(a, bal.get(a) - 2); bal.set(target, bal.get(target) + 2); moved = true; break;
    }
    if (!moved) break;
  }
}

// ------------------------------------------------------------------------------------------------------- the generator
/**
 * @param {object}   o
 * @param {{id:number,conf:string,name:string}[]} o.teams
 * @param {{conference:number,nonConference:number}} o.seeds
 * @param {{a:number,b:number,site:"neutral"|"host",day?:number}[]} [o.marquee]  a = visitor, b = host (ids)
 * @param {Set<number>} [o.prevNonConfPairs] pairKey()s of last season's non-conference games
 * @returns {{games:object[], report:object}}
 */
export function generateSchedule({ teams, seeds, marquee = [], prevNonConfPairs = new Set() }) {
  const conf = {}, name = {};
  for (const t of teams) { conf[t.id] = t.conf; name[t.id] = t.name; }
  const byConf = new Map();
  for (const t of teams) { if (!byConf.has(t.conf)) byConf.set(t.conf, []); byConf.get(t.conf).push(t.id); }
  const confNames = [...byConf.keys()].sort();
  const confDays = range(...RULES.confDays), ncDays = range(...RULES.nonConfDays);

  // 1) conference games
  const rc = makeRng(seeds.conference);
  let games = [];
  const load = Object.fromEntries(confDays.map((d) => [d, 0]));
  for (const cn of confNames) games.push(...scheduleConference(byConf.get(cn).slice().sort((x, y) => x - y), rc, confDays, load));
  const confCount = Object.fromEntries(teams.map((t) => [t.id, 0]));
  for (const g of games) { confCount[g.a]++; confCount[g.b]++; }

  // 2) non-conference games
  const rn = makeRng(seeds.nonConference);
  const need = {};
  for (const t of teams) need[t.id] = RULES.gamesPerTeam - confCount[t.id];
  const warnings = [];
  const mq = [];
  const forbidden = new Set(prevNonConfPairs), usedPairs = new Set();
  for (const m of marquee) {
    if (conf[m.a] === conf[m.b]) throw new Error(`marquee ${name[m.a]} vs ${name[m.b]} are in the same conference`);
    if (usedPairs.has(pairKey(m.a, m.b))) throw new Error(`marquee pair listed twice: ${name[m.a]} / ${name[m.b]}`);
    usedPairs.add(pairKey(m.a, m.b)); mq.push(m); need[m.a]--; need[m.b]--;
  }
  for (const t of teams) if (need[t.id] < 0) throw new Error(`${name[t.id]} has more marquee games than non-conference slots`);
  for (const k of usedPairs) forbidden.add(k);   // random games may not duplicate a marquee game
  const edges = pairNonConference({ teamIds: teams.map((t) => t.id), conf, need, forbidden: new Set([...forbidden]), rand: rn });
  // the same prevNonConf set is exempt only for marquee pairs, which were added to `forbidden` above for the random pairing but are placed below
  const all = [...mq.map((m) => ({ a: m.a, b: m.b, marquee: m })), ...edges.map(([u, v]) => ({ a: u, b: v }))];
  // days via edge colouring; vertices = team ids
  const nV = Math.max(...teams.map((t) => t.id)) + 1, ncEdges = all.map((e) => [e.a, e.b]);
  const colors = balanceColors(nV, ncEdges, edgeColor(nV, ncEdges, { rand: rn, limit: ncDays.length }), ncDays.length, rn); // even games per day
  const nClasses = ncDays.length;
  const dayOfClass = new Array(nClasses).fill(null);
  const usedDays = new Set();
  // honour optional marquee days by naming that class's day
  for (let i = 0; i < all.length; i++) {
    const d = all[i].marquee && all[i].marquee.day;
    if (d) {
      if (dayOfClass[colors[i]] === null && !usedDays.has(d)) { dayOfClass[colors[i]] = d; usedDays.add(d); }
      else if (dayOfClass[colors[i]] !== d) warnings.push(`marquee ${name[all[i].a]} vs ${name[all[i].b]} could not be placed on day ${d}`);
    }
  }
  const free = shuffle(ncDays.filter((d) => !usedDays.has(d)), rn);
  for (let c = 0; c < nClasses; c++) if (dayOfClass[c] === null) dayOfClass[c] = free.pop();
  // home / away: marquee fixed, the rest balanced by Euler orientation + path flips
  const ncGames = all.map((e, i) => {
    if (e.marquee) return { day: dayOfClass[colors[i]], type: "Reg", a: e.a, b: e.b, home: e.marquee.site === "neutral" ? 0 : 1, free: false };
    return { day: dayOfClass[colors[i]], type: "Reg", a: e.a, b: e.b, home: 1, free: true };
  });
  const freeIdx = ncGames.map((g, i) => (g.free ? i : -1)).filter((i) => i >= 0);
  const dir = eulerOrient(Math.max(...teams.map((t) => t.id)) + 1, freeIdx.map((i) => [ncGames[i].a, ncGames[i].b]));
  freeIdx.forEach((gi, k) => { if (!dir[k]) { const g = ncGames[gi]; [g.a, g.b] = [g.b, g.a]; } });
  balanceHomeAway(teams.map((t) => t.id), ncGames, rn);

  // 3) combine, sort (day, host), number
  const final = [...games.map((g) => ({ ...g, home: 1 })), ...ncGames].map(({ day, type, a, b, home }) => ({ day, type, a, b, home }));
  final.sort((x, y) => x.day - y.day || name[x.b].localeCompare(name[y.b]) || name[x.a].localeCompare(name[y.a]));
  final.forEach((g, i) => { g.id = i + 1; });
  return { games: final, report: { warnings, games: final.length, nonConfColors: nClasses } };
}

// ------------------------------------------------------------------------------------------------------- the validator
/**
 * Checks every rule. games = [{id, day, type, a, b, home}] (a visitor, b host). Returns {ok, errors, stats}.
 */
export function validateSchedule({ games, teams, prevNonConfPairs = new Set(), marquee = [] }) {
  const errors = [], err = (m) => { if (errors.length < 60) errors.push(m); };
  const conf = {}, name = {};
  for (const t of teams) { conf[t.id] = t.conf; name[t.id] = t.name; }
  const per = new Map(teams.map((t) => [t.id, 0])), dayTeam = new Set();
  const mqKeys = new Set(marquee.map((m) => pairKey(m.a, m.b)));
  const ncPairs = new Set(), confPair = new Map();
  const confHA = new Map(teams.map((t) => [t.id, 0])), ncHA = new Map(teams.map((t) => [t.id, 0]));
  const confN = new Map(), sizes = new Map();
  for (const t of teams) sizes.set(t.conf, (sizes.get(t.conf) || 0) + 1);
  for (const g of games) {
    for (const t of [g.a, g.b]) {
      per.set(t, (per.get(t) || 0) + 1);
      const k = g.day * 100000 + t; if (dayTeam.has(k)) err(`${name[t]} plays twice on day ${g.day}`); dayTeam.add(k);
    }
    const same = conf[g.a] === conf[g.b], key = pairKey(g.a, g.b);
    if (g.type === "Conf") {
      if (!same) err(`conference game between different conferences: ${name[g.a]} / ${name[g.b]}`);
      if (g.day < RULES.confDays[0] || g.day > RULES.confDays[1]) err(`conference game on day ${g.day}`);
      if (!g.home) err("conference game on a neutral court");
      confPair.set(key, [...(confPair.get(key) || []), g]);
      confHA.set(g.b, confHA.get(g.b) + 1); confHA.set(g.a, confHA.get(g.a) - 1);
      confN.set(g.a, (confN.get(g.a) || 0) + 1); confN.set(g.b, (confN.get(g.b) || 0) + 1);
    } else if (g.type === "Reg") {
      if (same) err(`non-conference game within a conference: ${name[g.a]} / ${name[g.b]}`);
      if (g.day < RULES.nonConfDays[0] || g.day > RULES.nonConfDays[1]) err(`non-conference game on day ${g.day}`);
      if (ncPairs.has(key)) err(`non-conference pair repeated: ${name[g.a]} / ${name[g.b]}`);
      ncPairs.add(key);
      if (prevNonConfPairs.has(key) && !mqKeys.has(key)) err(`repeats last season's non-conference pair: ${name[g.a]} / ${name[g.b]}`);
      if (g.home) { ncHA.set(g.b, ncHA.get(g.b) + 1); ncHA.set(g.a, ncHA.get(g.a) - 1); }
    } else err(`unknown type ${g.type}`);
  }
  for (const t of teams) if (per.get(t.id) !== RULES.gamesPerTeam) err(`${name[t.id]} plays ${per.get(t.id)} games, not ${RULES.gamesPerTeam}`);
  // conference structure
  for (const [cn, n] of sizes) {
    const members = teams.filter((t) => t.conf === cn).map((t) => t.id);
    const want = Math.min(RULES.confGameCap, 2 * (n - 1));
    for (const t of members) if ((confN.get(t) || 0) !== want) err(`${name[t]} has ${confN.get(t) || 0} conference games, expected ${want}`);
    for (let i = 0; i < members.length; i++) for (let j = i + 1; j < members.length; j++) {
      const gs = confPair.get(pairKey(members[i], members[j])) || [];
      if (2 * (n - 1) <= RULES.confGameCap) { if (gs.length !== 2) err(`${cn}: ${name[members[i]]} / ${name[members[j]]} play ${gs.length} times, expected 2`); }
      else if (gs.length < 1 || gs.length > 2) err(`${cn}: ${name[members[i]]} / ${name[members[j]]} play ${gs.length} times`);
      if (gs.length === 2 && gs[0].b === gs[1].b) err(`${cn}: ${name[members[i]]} / ${name[members[j]]} both games at the same host`);
    }
  }
  for (const t of teams) if (confHA.get(t.id) !== 0) err(`${name[t.id]} conference home-away imbalance ${confHA.get(t.id)}`);
  // marquee
  for (const m of marquee) {
    const g = games.find((x) => x.type === "Reg" && pairKey(x.a, x.b) === pairKey(m.a, m.b));
    if (!g) { err(`marquee ${name[m.a]} / ${name[m.b]} missing`); continue; }
    if (m.site === "neutral" ? g.home : !(g.home && g.a === m.a && g.b === m.b)) err(`marquee ${name[m.a]} / ${name[m.b]} has the wrong site`);
    if (m.day && g.day !== m.day) err(`marquee ${name[m.a]} / ${name[m.b]} is on day ${g.day}, wanted ${m.day}`);
  }
  // ids
  games.forEach((g, i) => { if (g.id !== i + 1) err(`game ids not sequential at ${g.id}`); });
  for (let i = 1; i < games.length; i++) if (games[i].day < games[i - 1].day) { err("games not sorted by day"); break; }
  const ncImb = teams.map((t) => Math.abs(ncHA.get(t.id)));
  return { ok: errors.length === 0, errors, stats: { games: games.length, maxNonConfImbalance: Math.max(0, ...ncImb), imbalancedTeams: ncImb.filter((x) => x > 1).length } };
}
