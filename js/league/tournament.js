// Conference tournaments (days 43-47) and the NCAA tournament (days 48-54).
// Every team in a conference enters its tournament. The bracket is a power-of-two single elimination bracket with
// byes for the top seeds, sized so the final is always on day 47 (ACC, 18 teams: two games on day 43, eight on 44).
export const CT_LAST_DAY = 47;

/** standard bracket order of seeds for a bracket of size p (1 v p, ...), top seed first */
export function seedOrder(p) {
  let o = [1];
  while (o.length < p) { const n = o.length * 2 + 1; o = o.flatMap((s) => [s, n - s]); }
  return o;
}

export const ctRounds = (n) => Math.max(1, Math.ceil(Math.log2(Math.max(2, n))));
export const ctFirstDay = (n) => CT_LAST_DAY + 1 - ctRounds(n);
export const ctGameId = (day, confIndex, pair) => 100000 + day * 1000 + confIndex * 20 + pair;

/**
 * Games of one conference tournament that can be played now. `seeds` = team ids in seed order, `played` = Map of
 * already-played games keyed "a|b" -> winner id. Returns [{day,a,b,pair}] for the next round whose inputs are all decided.
 */
export function ctRound(seeds, winnerOf, roundIndex) {
  const n = seeds.length, k = ctRounds(n), p = 2 ** k, order = seedOrder(p);
  let slots = order.map((s) => (s <= n ? seeds[s - 1] : null));   // null = bye
  const games = [];
  for (let r = 0; r <= roundIndex; r++) {
    const next = [], here = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i], b = slots[i + 1];
      if (a == null || b == null) { next.push(a == null ? b : a); continue; }
      const w = winnerOf(a, b, r);
      here.push({ day: ctFirstDay(n) + r, a, b, pair: i / 2 });
      next.push(w == null ? undefined : w);
    }
    if (r === roundIndex) { games.push(...here); break; }
    if (next.some((x) => x === undefined)) return null;           // earlier round unfinished
    slots = next;
  }
  return games;
}

/** all CT games for a conference whose pairing is determined (round by round) given a winner lookup */
export function ctSchedule(seeds, winnerOf) {
  const out = [], rounds = ctRounds(seeds.length);
  for (let r = 0; r < rounds; r++) {
    const g = ctRound(seeds, winnerOf, r);
    if (!g) break;
    out.push(...g);
    if (g.some((x) => winnerOf(x.a, x.b, r) == null)) break;
  }
  return out;
}

/**
 * Seeding: conference win %, then head-to-head record among the tied teams, then scoring margin, then overall win % (inferred from Season 1's real seeding).
 * `games` = played regular-season conference games ({a,b,ptsA,ptsB,type:"Conf",ctx}).
 */
export function tournamentSeeds(confTeams, games) {
  const pct = (w, l) => (w + l ? w / (w + l) : 0);
  const base = [...confTeams].sort((x, y) => pct(y.cw, y.cl) - pct(x.cw, x.cl) || y.margin - x.margin || pct(y.w, y.l) - pct(x.w, x.l));
  const key = (t) => pct(t.cw, t.cl).toFixed(9);
  const out = [];
  for (let i = 0; i < base.length;) {
    let j = i; while (j < base.length && key(base[j]) === key(base[i])) j++;
    const grp = base.slice(i, j);
    if (grp.length > 1) {
      const ids = new Set(grp.map((t) => t.id)), rec = new Map(grp.map((t) => [t.id, [0, 0]]));
      for (const g of games) if (g.ptsA != null && ids.has(g.a) && ids.has(g.b)) { const w = g.ptsA > g.ptsB ? g.a : g.b, l = w === g.a ? g.b : g.a; rec.get(w)[0]++; rec.get(l)[1]++; }
      grp.sort((x, y) => pct(...rec.get(y.id)) - pct(...rec.get(x.id)) || y.margin - x.margin || pct(y.w, y.l) - pct(x.w, x.l));
    }
    out.push(...grp); i = j;
  }
  return out;
}

// ---------------- NCAA tournament ----------------
export const NCAA_REGIONS = ["East", "South", "West", "Midwest"];
const R64_PAIRS = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
export const NCAA_FIRST_ID = 5810;   // First Four 5810-5813, R64 5814-5845, R32 5846-5861, S16 5862-5869, E8 5870-5873, FF 5874-5875, title 5876

/**
 * Every NCAA game whose two teams are known, given the field and the winners so far.
 * field: [{team, seed, region, ff}] (68 teams). winnerOf(gameId) -> team id or undefined.
 * Returns all games (played or not) that can be set up: [{id, day, ctx, a, b}] in id order. Neutral site.
 */
export function ncaaGames(field, winnerOf) {
  const out = [];
  const winners = new Map();                 // slot key -> team
  const add = (id, day, ctx, a, b) => { if (a == null || b == null) return null; out.push({ id, day, ctx, a, b }); return winnerOf(id) ?? null; };
  // First Four
  const ffWin = new Map();
  for (let g = 1; g <= 4; g++) {
    const t = field.filter((f) => f.ff === g);
    if (t.length === 2) ffWin.set(g, add(NCAA_FIRST_ID + g - 1, 48, "First Four", t[0].team, t[1].team));
  }
  const slotTeam = (region, seed) => {
    const direct = field.filter((f) => f.region === region && f.seed === seed && !f.ff);
    if (direct.length) return direct[0].team;
    const ff = field.find((f) => f.region === region && f.seed === seed && f.ff);
    return ff ? ffWin.get(ff.ff) ?? null : null;
  };
  let prev = [];                              // winners of the previous round in id order (null = unknown)
  const roundRegion = [];
  let id = NCAA_FIRST_ID + 4;
  for (const region of NCAA_REGIONS) {
    let cur = [];
    for (const [s1, s2] of R64_PAIRS) cur.push(add(id++, 49, region, slotTeam(region, s1), slotTeam(region, s2)));
    roundRegion.push(cur);
  }
  // later rounds: all regions' games of a round get consecutive ids, region by region
  let regionWin = roundRegion;
  for (const day of [50, 51, 52]) {
    const next = [];
    for (let r = 0; r < 4; r++) {
      const cur = regionWin[r], nxt = [];
      for (let i = 0; i < cur.length; i += 2) nxt.push(add(id++, day, NCAA_REGIONS[r], cur[i], cur[i + 1]));
      next.push(nxt);
    }
    regionWin = next;
  }
  const champs = regionWin.map((x) => x[0]);   // East, South, West, Midwest
  const f1 = add(id++, 53, "Final Four", champs[0], champs[1]);
  const f2 = add(id++, 53, "Final Four", champs[2], champs[3]);
  add(id++, 54, "Championship", f1, f2);
  return out;
}

/** Regular-season lines (conference record, overall record, average margin) from the played Reg/Conf games only, so seeds never move once tournaments start. */
export function regularSeasonLines(games, ids) {
  const L = new Map(ids.map((id) => [id, { id, cw: 0, cl: 0, w: 0, l: 0, diff: 0, gp: 0, margin: 0 }]));
  for (const g of games) {
    if ((g.type !== "Reg" && g.type !== "Conf") || g.ptsA == null) continue;
    for (const [id, f, a] of [[g.a, g.ptsA, g.ptsB], [g.b, g.ptsB, g.ptsA]]) {
      const t = L.get(id); if (!t) continue;
      t.gp++; t.diff += f - a; f > a ? t.w++ : t.l++;
      if (g.type === "Conf") f > a ? t.cw++ : t.cl++;
    }
  }
  for (const t of L.values()) t.margin = t.gp ? t.diff / t.gp : 0;
  return [...L.values()];
}
