// Cross-season history: titles, team histories, leaderboards, most improved, dynasties and droughts, head-to-head.
// Input: seasons in order, each { id, label, status, summary (seasonSummary), games (played state games), teams (data.teams) }.

export function titlesTable(seasons, names) {
  return seasons.map((s) => {
    const t = s.summary.title;
    return { season: s.id, label: s.label, status: s.status, champion: t ? t.champion : null, runnerUp: t ? t.runnerUp : null, score: t ? t.score : null,
      finalFour: t ? t.finalFour : [], championName: t ? names[t.champion] : null, runnerUpName: t ? names[t.runnerUp] : null,
      championSeed: t ? s.summary.teams[t.champion].seed : null, championRecord: t ? `${s.summary.teams[t.champion].W}-${s.summary.teams[t.champion].L}` : null,
      championConf: t ? s.summary.teams[t.champion].conf : null, upsets: t ? t.upsets : null };
  });
}

/** all-time counts by team and by conference (conference = the team's conference that season) */
export function allTime(seasons) {
  const team = new Map(), conf = new Map();
  const T = (id) => { if (!team.has(id)) team.set(id, { id, titles: 0, runnerUps: 0, finalFours: 0, eliteEights: 0, appearances: 0, tourneyW: 0, tourneyL: 0, ctTitles: 0, wins: 0, losses: 0, seasons: 0, bestRank: null }); return team.get(id); };
  const C = (k) => { if (!conf.has(k)) conf.set(k, { conf: k, titles: 0, finalFours: 0, bids: 0, tourneyW: 0 }); return conf.get(k); };
  for (const s of seasons) {
    for (const t of s.summary.teams) {
      const r = T(t.id);
      r.wins += t.W; r.losses += t.L; if (t.GP) r.seasons++;
      if (t.rank != null && (r.bestRank == null || t.rank < r.bestRank)) r.bestRank = t.rank;
      if (t.seed != null) { r.appearances++; C(t.conf).bids++; }
      r.tourneyW += t.tourneyW; r.tourneyL += t.tourneyL; C(t.conf).tourneyW += t.tourneyW;
      if (t.lastRound != null && t.lastRound >= 4) r.eliteEights++;
      if (t.confTourney === "Champion") r.ctTitles++;
    }
    const ti = s.summary.title;
    if (ti) {
      T(ti.champion).titles++; T(ti.runnerUp).runnerUps++; C(s.summary.teams[ti.champion].conf).titles++;
      for (const id of ti.finalFour) { T(id).finalFours++; C(s.summary.teams[id].conf).finalFours++; }
    }
  }
  return { teams: [...team.values()], confs: [...conf.values()] };
}

/** one team's season-by-season line */
export function teamHistory(seasons, id) {
  return seasons.map((s) => {
    const t = s.summary.teams[id];
    return { season: s.id, label: s.label, status: s.status, tier: t.tier, conf: t.conf, W: t.W, L: t.L, confW: t.confW, confL: t.confL, rating: t.rating, rank: t.rank,
      finalAP: t.finalAP, confTourney: t.confTourney, seed: t.seed, ncaaResult: t.ncaaResult, tourneyW: t.tourneyW, champion: s.summary.title && s.summary.title.champion === id };
  });
}

/** rating change between consecutive seasons (both with games). */
export function mostImproved(seasons, names, top = 10) {
  const out = [];
  for (let i = 1; i < seasons.length; i++) {
    const a = seasons[i - 1].summary.teams, b = seasons[i].summary.teams;
    for (let id = 0; id < b.length; id++) if (a[id].GP && b[id].GP >= 5) out.push({ id, name: names[id], from: seasons[i - 1].label, to: seasons[i].label, before: a[id].rating, after: b[id].rating, delta: b[id].rating - a[id].rating, winsBefore: `${a[id].W}-${a[id].L}`, winsAfter: `${b[id].W}-${b[id].L}` });
  }
  out.sort((x, y) => y.delta - x.delta);
  return { improved: out.slice(0, top), declined: out.slice(-top).reverse() };
}

/**
 * Dynasties: longest runs of consecutive titles / Final Fours / NCAA appearances (finished seasons only).
 * Droughts: for every team, seasons since its last NCAA appearance and last title (counting finished seasons).
 */
export function streaks(seasons, names) {
  const done = seasons.filter((s) => s.summary.title);
  const n = names.length, run = (pred) => {
    const best = [];
    for (let id = 0; id < n; id++) {
      let cur = 0, max = 0, end = null;
      done.forEach((s, i) => { if (pred(s, id)) { cur++; if (cur > max) { max = cur; end = i; } } else cur = 0; });
      if (max) best.push({ id, name: names[id], length: max, through: done[end].label, active: cur === max && end === done.length - 1 });
    }
    return best.sort((a, b) => b.length - a.length || a.name.localeCompare(b.name));
  };
  const titles = run((s, id) => s.summary.title.champion === id);
  const finalFours = run((s, id) => s.summary.title.finalFour.includes(id));
  const appearances = run((s, id) => s.summary.teams[id].seed != null);
  const droughts = [];
  for (let id = 0; id < n; id++) {
    let since = 0; for (let i = done.length - 1; i >= 0 && done[i].summary.teams[id].seed == null; i--) since++;
    const last = done.length ? done[done.length - 1].summary.teams[id] : null;
    droughts.push({ id, name: names[id], seasonsWithoutBid: since, never: since === done.length, tier: last ? last.tier : null });
  }
  return { titles, finalFours, appearances, droughts };
}

/** every game between two teams across seasons */
export function headToHead(seasons, a, b) {
  const games = [];
  for (const s of seasons) for (const g of s.games) {
    if (g.ptsA == null || !((g.a === a && g.b === b) || (g.a === b && g.b === a))) continue;
    const aPts = g.a === a ? g.ptsA : g.ptsB, bPts = g.a === a ? g.ptsB : g.ptsA;
    games.push({ season: s.label, day: g.day, type: g.type, ctx: g.ctx, aPts, bPts, aWon: aPts > bPts, site: g.home === 0 ? "neutral" : g.b === a ? "home" : "away" });
  }
  const aw = games.filter((g) => g.aWon).length;
  return { games, aWins: aw, bWins: games.length - aw, aPts: games.reduce((s, g) => s + g.aPts, 0), bPts: games.reduce((s, g) => s + g.bPts, 0) };
}
