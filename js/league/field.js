// Helpers for the tournament field: validate a set of committee picks, suggest a field from the Board, and compare weeks.
export const REGIONS = ["East", "South", "West", "Midwest"];   // overall No. 1 seed goes East (workbook layout)

// The four "pods" of a region: the teams in a pod can meet in the round of 64 or the round of 32.
const POD_OF = { 1: 0, 16: 0, 8: 0, 9: 0, 5: 1, 12: 1, 4: 1, 13: 1, 6: 2, 11: 2, 3: 2, 14: 2, 7: 3, 10: 3, 2: 3, 15: 3 };
const confLookup = (confOf) => (!confOf ? null : typeof confOf === "function" ? confOf : (id) => confOf.get(id));

/**
 * Hard rule (the commissioner's): no two teams from the same conference may meet in the first or second round, i.e.
 * share a pod. The two teams of one First Four game are a single slot and are not checked against each other.
 * field: [{team, seed, region, ff}], confOf: Map id -> conference or a function. -> [{region, conf, teams:[a,b]}]
 */
export function conferenceConflicts(field, confOf) {
  const conf = confLookup(confOf), out = [];
  if (!conf) return out;
  const pods = new Map();
  for (const p of field) { if (!(p.seed >= 1 && p.seed <= 16)) continue; const k = `${p.region}|${POD_OF[p.seed]}`; pods.set(k, [...(pods.get(k) || []), p]); }
  for (const [k, ps] of pods) for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j];
    if (a.ff && a.ff === b.ff) continue;
    const ca = conf(a.team);
    if (ca && ca === conf(b.team)) out.push({ region: k.split("|")[0], conf: ca, teams: [a, b] });
  }
  return out;
}

/** picks for one week -> {errors[], warnings[]}. With confOf, same-conference first/second-round meetings are errors. */
export function validateField(picks, confOf = null) {
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
  for (const c of conferenceConflicts(field, confOf)) errors.push(`Same-conference teams (${c.conf}) could meet in the first or second round: ${c.region} ${c.teams[0].seed} seed (id ${c.teams[0].team}) and ${c.teams[1].seed} seed (id ${c.teams[1].team}).`);
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
export function suggestField(rows, atLarge = 37, champs = null) {
  const byConf = new Map();
  for (const r of rows) if (!byConf.has(r.conf) || r.score > byConf.get(r.conf).score) byConf.set(r.conf, r);
  if (champs) for (const [conf, team] of champs) { const r = rows.find((x) => x.team === team); if (r) byConf.set(conf, r); }   // real conference-tournament winners take the auto-bids
  const autoIds = new Set([...byConf.values()].map((r) => r.team));
  const open = rows.filter((r) => !autoIds.has(r.team)).sort((a, b) => b.score - a.score);
  const largeIn = open.slice(0, atLarge), firstOut = open.slice(atLarge, atLarge + 4), nextOut = open.slice(atLarge + 4, atLarge + 8);
  const autos = [...byConf.values()].sort((a, b) => b.score - a.score);
  // First Four: the four weakest at-large teams (games 1-2) and the four weakest auto-bids (games 3-4). A play-in game
  // is not pinned to the 11 or 16 line: it's one bracket slot, seeded where its two teams belong on the S-curve (the
  // average of their Seed Scores), like every other slot. In a year with strong small-conference champions the
  // at-large games can land on the 12 or 13 line; in a normal year they come out around 11 and the auto-bid games at 16.
  const ffLarge = largeIn.slice(-4), ffAuto = autos.slice(-4);
  const slots = [...largeIn.slice(0, -4), ...autos.slice(0, -4)].map((r) => ({ teams: [r], s: r.seedScore }));
  [[ffLarge.slice(0, 2), 1], [ffLarge.slice(2, 4), 2], [ffAuto.slice(0, 2), 3], [ffAuto.slice(2, 4), 4]]
    .forEach(([teams, g]) => slots.push({ teams, ff: g, s: (teams[0].seedScore + teams[1].seedScore) / 2 }));
  slots.sort((a, b) => b.s - a.s);
  const picks = [];
  const regionsFor = (line) => (line % 2 === 1 ? REGIONS : [...REGIONS].reverse());
  const place = (r, seed, region, ffGame) => picks.push({ group: "Field", team: r.team, seed, region, bid: autoIds.has(r.team) ? "Auto" : "At-large", ff: ffGame || null, bubble: null, note: "" });
  slots.forEach((slot, i) => { const line = Math.floor(i / 4) + 1, region = regionsFor(line)[i % 4]; for (const r of slot.teams) place(r, line, region, slot.ff); });
  separateConferences(picks, new Map(rows.map((r) => [r.team, r.conf])));
  firstOut.forEach((r, k) => picks.push({ group: "First Four Out", team: r.team, seed: null, region: null, bid: null, ff: null, bubble: k + 1, note: "" }));
  nextOut.forEach((r, k) => picks.push({ group: "Next Four Out", team: r.team, seed: null, region: null, bid: null, ff: null, bubble: k + 5, note: "" }));
  return picks;
}

/**
 * Move bracket slots (a team, or a First Four pair) until no two same-conference teams share a pod. Swaps prefer the
 * same seed line in another region (the seed doesn't change); if that can't clear a conflict, a slot may trade places
 * with a slot one line away. Mutates picks; returns the number of conflicts left (0 unless the field is impossible).
 */
export function separateConferences(picks, confOf) {
  const field = picks.filter((p) => p.group === "Field");
  const count = () => conferenceConflicts(field, confOf).length;
  const slotOf = (region, seed) => field.filter((p) => p.region === region && p.seed === seed);
  const swap = (A, B) => { const a = { region: A[0].region, seed: A[0].seed }, b = { region: B[0].region, seed: B[0].seed }; for (const p of A) { p.region = b.region; p.seed = b.seed; } for (const p of B) { p.region = a.region; p.seed = a.seed; } };
  for (let guard = 0, n = count(); n > 0 && guard < 200; guard++) {
    const c = conferenceConflicts(field, confOf)[0];
    let best = null;
    for (const t of [...c.teams].sort((x, y) => y.seed - x.seed)) {           // try moving the lower seed first
      const A = slotOf(t.region, t.seed);
      const targets = [];
      for (const R of REGIONS) if (R !== t.region) targets.push([R, t.seed]);
      for (const d of [1, -1]) for (const R of REGIONS) if (t.seed + d >= 1 && t.seed + d <= 16) targets.push([R, t.seed + d]);
      for (const [R, s] of targets) {
        const B = slotOf(R, s); if (!B.length || B.some((p) => A.includes(p))) continue;
        if (s !== t.seed && (A.some((p) => p.ff) !== B.some((p) => p.ff))) continue;   // keep First Four slots paired by line kind
        swap(A, B); const m = count(); swap(B, A);
        const cost = m * 10 + Math.abs(s - t.seed);
        if (m < n && (!best || cost < best.cost)) best = { A, B, cost, m };
      }
      if (best && best.m === 0) break;
    }
    if (!best) break;
    swap(best.A, best.B); n = best.m;
  }
  return count();
}

/** change label of a team's field entry versus the previous week */
export function changeLabel(cur, prev) {
  if (!prev) return "NEW";
  if (prev.group !== cur.group) return prev.group === "Field" ? "▼ out" : "▲ in";
  if (cur.group !== "Field") return "—";
  const d = prev.seed - cur.seed;
  return d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "—";
}

/**
 * How one team's placement changed since the previous week: {kind, n, short, long}.
 * kind: up | down | same | new | in | out; short is for tight spaces ("▲2"), long is words ("Up 2", "Out, was a 6 seed").
 */
export function movement(cur, prev) {
  if (!prev) return { kind: "new", n: 0, short: "NEW", long: "New to the board" };
  const cf = cur.group === "Field", pf = prev.group === "Field";
  if (cf && pf) { const d = prev.seed - cur.seed; return d > 0 ? { kind: "up", n: d, short: `▲${d}`, long: `Up ${d}` } : d < 0 ? { kind: "down", n: -d, short: `▼${-d}`, long: `Down ${-d}` } : { kind: "same", n: 0, short: "", long: "No change" }; }
  if (cf) return { kind: "in", n: 0, short: "IN", long: `In (was ${prev.group.toLowerCase()})` };
  if (pf) return { kind: "out", n: 0, short: "OUT", long: `Out (was a ${prev.seed} seed)` };
  if (prev.group !== cur.group) { const up = cur.group === "First Four Out"; return { kind: up ? "up" : "down", n: 1, short: up ? "▲" : "▼", long: up ? "Up to the first four out" : "Down to the next four out" }; }
  const d = (prev.bubble ?? 0) - (cur.bubble ?? 0);
  return d > 0 ? { kind: "up", n: d, short: `▲${d}`, long: `Up ${d}` } : d < 0 ? { kind: "down", n: -d, short: `▼${-d}`, long: `Down ${-d}` } : { kind: "same", n: 0, short: "", long: "No change" };
}

/** the week's changes as lists: moved up / down (biggest first), newly in the field, dropped out of it */
export function fieldChanges(cur, prev) {
  const pm = new Map(prev.map((p) => [p.team, p])), field = cur.filter((p) => p.group === "Field"), out = { up: [], down: [], newIn: [], dropped: [], same: [] };
  for (const p of field) { const m = movement(p, pm.get(p.team)); const row = { team: p.team, seed: p.seed, was: pm.get(p.team) || null, m };
    if (m.kind === "up") out.up.push(row); else if (m.kind === "down") out.down.push(row); else if (m.kind === "in" || m.kind === "new") out.newIn.push(row); else out.same.push(row); }
  const nowIds = new Set(field.map((p) => p.team));
  for (const p of prev) if (p.group === "Field" && !nowIds.has(p.team)) out.dropped.push({ team: p.team, was: p, now: cur.find((c) => c.team === p.team) || null });
  out.up.sort((a, b) => b.m.n - a.m.n || a.seed - b.seed); out.down.sort((a, b) => b.m.n - a.m.n || a.seed - b.seed); out.dropped.sort((a, b) => a.was.seed - b.was.seed);
  return out;
}
