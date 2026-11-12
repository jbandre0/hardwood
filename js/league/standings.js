// Conference standings and the conference power table (workbook sheet "Standings").

/** Teams of one conference sorted by conference win %, then overall win %, then scoring margin (all descending). */
export function confStandings(teams, conf) {
  const ratio = (w, g) => (g ? w / g : 0);
  return teams.filter((t) => t.conf === conf).sort((a, b) =>
    ratio(b.cw, b.cw + b.cl) - ratio(a.cw, a.cw + a.cl) || ratio(b.w, b.gp) - ratio(a.w, a.gp) || b.margin - a.margin);
}

/**
 * How each conference does against everyone else: non-conference record (all games minus conference games),
 * average rating, average tier rating, and a rank by average rating (1 = best).
 */
export function conferencePower(teams) {
  const by = new Map();
  for (const t of teams) {
    if (!by.has(t.conf)) by.set(t.conf, { conf: t.conf, teams: 0, ncW: 0, ncL: 0, rating: 0, tier: 0 });
    const c = by.get(t.conf);
    c.teams++; c.ncW += t.w - t.cw; c.ncL += t.l - t.cl; c.rating += t.rating; c.tier += t.tierRating;
  }
  const rows = [...by.values()].map((c) => ({ conf: c.conf, teams: c.teams, ncW: c.ncW, ncL: c.ncL, ncPct: c.ncW + c.ncL ? c.ncW / (c.ncW + c.ncL) : 0, avgRating: c.rating / c.teams, avgTier: c.tier / c.teams }));
  const sorted = [...rows].sort((a, b) => b.avgRating - a.avgRating);
  for (const r of rows) r.rank = sorted.findIndex((x) => x.conf === r.conf) + 1;
  return rows.sort((a, b) => a.conf.localeCompare(b.conf));
}
