// Helpers for the tournament field: validate a set of committee picks, suggest a field from the Board, and compare weeks.
export const REGIONS = ["East", "South", "West", "Midwest"];   // overall No. 1 seed goes East (workbook layout)

/** picks for one week -> {errors[], warnings[]} */
export function validateField(picks) {
  const errors = [], warnings = [];
  const field = picks.filter((p) => p.group === "Field");
  if (field.length !== 68) errors.push(`The field has ${field.length} teams, not 68.`);
  const seen = new Set();
  for (const p of picks) { if (seen.has(p.team)) errors.push(`A team is listed twice (id ${p.team}).`); seen.add(p.team); }
  const slots = new Map();
  for (const p of field) {
    if (!(p.seed >= 1 && p.seed <= 16)) { errors.push("Every team needs a seed from 1 to 16."); break; }
    if (!REGIONS.includes(p.region)) { errors.push("Every team needs a region (East, South, West or Midwest)."); break; }
    const k = `${p.region}|${p.seed}`; slots.set(k, (slots.get(k) || 0) + 1);
  }
  for (const r of REGIONS) for (let s = 1; s <= 16; s++) {
    const n = slots.get(`${r}|${s}`) || 0;
    if (n === 0) warnings.push(`${r} has no ${s} seed.`);
    if (n > 2) errors.push(`${r} has ${n} teams at seed ${s}.`);
  }
  const ff = new Map();
  for (const p of field) if (p.ff > 0) ff.set(p.ff, [...(ff.get(p.ff) || []), p]);
  for (let g = 1; g <= 4; g++) {
    const t = ff.get(g) || [];
    if (t.length !== 2) errors.push(`First Four game ${g} has ${t.length} teams (needs 2).`);
    else if (t[0].seed !== t[1].seed || t[0].region !== t[1].region) errors.push(`First Four game ${g} teams must share a seed and region.`);
  }
  for (const [k, n] of slots) { const [r, s] = k.split("|"); if (n === 2 && !field.some((p) => p.region === r && p.seed === +s && p.ff > 0)) errors.push(`${r} has two ${s} seeds that are not a First Four game.`); }
  const nf = picks.filter((p) => p.group === "First Four Out").length, nn = picks.filter((p) => p.group === "Next Four Out").length;
  if (nf !== 4) warnings.push(`First Four Out lists ${nf} teams (usually 4).`);
  if (nn !== 4) warnings.push(`Next Four Out lists ${nn} teams (usually 4).`);
  return { errors, warnings };
}

/**
 * Suggest a field from the Board rows (computeBoard output, with ratings). Auto-bids = best Score in each conference,
 * at-large = best remaining Scores, seeds by an S-curve of the Seed Score. It does not separate conference rivals; the
 * committee is expected to edit it.
 */
export function suggestField(rows, atLarge = 37) {
  const byConf = new Map();
  for (const r of rows) if (!byConf.has(r.conf) || r.score > byConf.get(r.conf).score) byConf.set(r.conf, r);
  const autoIds = new Set([...byConf.values()].map((r) => r.team));
  const open = rows.filter((r) => !autoIds.has(r.team)).sort((a, b) => b.score - a.score);
  const largeIn = open.slice(0, atLarge), firstOut = open.slice(atLarge, atLarge + 4), nextOut = open.slice(atLarge + 4, atLarge + 8);
  const autos = [...byConf.values()].sort((a, b) => b.score - a.score);
  // First Four: the four weakest at-large teams (11 line) and the four weakest auto-bids (16 line)
  const ffLarge = largeIn.slice(-4), ffAuto = autos.slice(-4);
  const direct = [...largeIn.slice(0, -4), ...autos.slice(0, -4)].map((r) => ({ r, s: r.seedScore })).sort((a, b) => b.s - a.s).map((x) => x.r);
  const picks = [];
  const regionsFor = (line) => (line % 2 === 1 ? REGIONS : [...REGIONS].reverse());
  let i = 0;
  const place = (r, seed, region, ffGame) => picks.push({ group: "Field", team: r.team, seed, region, bid: autoIds.has(r.team) ? "Auto" : "At-large", ff: ffGame || null, bubble: null, note: "" });
  for (let line = 1; line <= 16; line++) {
    const regs = regionsFor(line);
    if (line === 11 || line === 16) {
      const ffTeams = line === 11 ? ffLarge : ffAuto;
      place(direct[i++], line, regs[0]); place(direct[i++], line, regs[1]);
      ffTeams.slice(0, 2).forEach((r) => place(r, line, regs[2], line === 11 ? 1 : 3));
      ffTeams.slice(2, 4).forEach((r) => place(r, line, regs[3], line === 11 ? 2 : 4));
    } else for (const reg of regs) place(direct[i++], line, reg);
  }
  firstOut.forEach((r, k) => picks.push({ group: "First Four Out", team: r.team, seed: null, region: null, bid: null, ff: null, bubble: k + 1, note: "" }));
  nextOut.forEach((r, k) => picks.push({ group: "Next Four Out", team: r.team, seed: null, region: null, bid: null, ff: null, bubble: k + 5, note: "" }));
  return picks;
}

/** change label of a team's field entry versus the previous week */
export function changeLabel(cur, prev) {
  if (!prev) return "NEW";
  if (prev.group !== cur.group) return prev.group === "Field" ? "▼ out" : "▲ in";
  if (cur.group !== "Field") return "—";
  const d = prev.seed - cur.seed;
  return d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "—";
}
