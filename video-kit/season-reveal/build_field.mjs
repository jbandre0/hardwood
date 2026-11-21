// Builds the Selection Sunday field privately. Prints ONLY counts and validation results (never team names).
// usage: node build_field.mjs <export.json> <champs.json> <outdir>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateField, separateConferences, conferenceConflicts, REGIONS } from "/home/user/hardwood/js/league/field.js";

const [, , expPath, champPath, outDir] = process.argv;
const X = JSON.parse(fs.readFileSync(expPath, "utf8")), champs = JSON.parse(fs.readFileSync(champPath, "utf8"));
const LEAGUE = JSON.parse(fs.readFileSync("/home/user/hardwood/data/league.json", "utf8")), LOGOS = JSON.parse(fs.readFileSync("/home/user/hardwood/data/logos.json", "utf8"));
const T = X.teams, byId = new Map(T.map((t) => [t.id, t])), nameOf = (id) => LEAGUE[id].name;
const CFG = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "committee.json"), "utf8"));

// ---- selection
const autoIds = new Set(Object.values(champs));
const pool = T.filter((t) => !autoIds.has(t.id)).sort((a, b) => b.boardScore - a.boardScore);
let atLarge = pool.slice(0, 37).map((t) => t.id).filter((id) => !CFG.removeAtLarge.includes(id));
atLarge.push(...CFG.addAtLarge);
if (atLarge.length !== 37 || new Set(atLarge).size !== 37) throw new Error("at-large count " + atLarge.length);
const bump = (X.boardSettings && X.boardSettings.seedBump) ?? 2;
const atLargeSorted = atLarge.map((id) => byId.get(id)).sort((a, b) => b.boardScore - a.boardScore);
const ffLarge = atLargeSorted.slice(-4);                                          // the four weakest at-large teams play in
const autosSorted = [...autoIds].map((id) => byId.get(id)).sort((a, b) => b.boardScore - a.boardScore);
const ffAuto = autosSorted.slice(-4);                                             // the four weakest automatic bids play in
const score = (t) => t.boardScore + (atLarge.includes(t.id) && !ffLarge.includes(t) ? bump : 0);

// ---- seeding: every slot (a team, or a First Four pair) goes where its score belongs on the S-curve
const slots = [];
for (const t of [...atLargeSorted.slice(0, -4), ...autosSorted.slice(0, -4)]) slots.push({ teams: [t], s: score(t) });
[[ffLarge.slice(0, 2), 1], [ffLarge.slice(2, 4), 2], [ffAuto.slice(0, 2), 3], [ffAuto.slice(2, 4), 4]].forEach(([ts, g]) => slots.push({ teams: ts, ff: g, s: (score(ts[0]) + score(ts[1])) / 2 }));
slots.sort((a, b) => b.s - a.s);
const regionsFor = (line) => (line % 2 === 1 ? REGIONS : [...REGIONS].reverse());
const picks = [];
slots.forEach((slot, i) => { const line = Math.floor(i / 4) + 1, region = regionsFor(line)[i % 4]; for (const t of slot.teams) picks.push({ group: "Field", team: t.id, seed: line, region, bid: autoIds.has(t.id) ? "Auto" : "At-large", ff: slot.ff || null }); });
const confOf = new Map(T.map((t) => [t.id, t.conf]));
const left = separateConferences(picks, confOf);

// secondary pass: where it is free (no first/second-round conflict), spread a conference's teams across regions on the same seed line
const field = picks;
const regionPairs = () => { let n = 0; for (const R of REGIONS) { const c = {}; for (const p of field.filter((q) => q.region === R)) c[confOf.get(p.team)] = (c[confOf.get(p.team)] || 0) + 1; for (const k of Object.values(c)) n += k * (k - 1) / 2; } return n; };
const slotAt = (R, s) => field.filter((p) => p.region === R && p.seed === s);
const swapSlots = (A, B) => { const a = { region: A[0].region }, b = { region: B[0].region }; for (const p of A) p.region = b.region; for (const p of B) p.region = a.region; };
let improved = true, guard = 0;
while (improved && guard++ < 60) {
  improved = false;
  for (let s = 1; s <= 16 && !improved; s++) for (const R1 of REGIONS) for (const R2 of REGIONS) {
    if (R1 >= R2 || improved) continue;
    const A = slotAt(R1, s), B = slotAt(R2, s); if (!A.length || !B.length) continue;
    if (s === 1 && (A[0].region === "East" || B[0].region === "East")) continue;    // the overall No. 1 seed stays in the East
    const before = regionPairs(); swapSlots(A, B);
    if (conferenceConflicts(field, confOf).length === 0 && regionPairs() < before) improved = true; else swapSlots(B, A);
  }
}
const full = [...field.map((p) => ({ ...p })), ...CFG.firstFourOut.map((id, i) => ({ group: "First Four Out", team: id, seed: null, region: null, bid: null, ff: null, bubble: i + 1 })), ...CFG.nextFourOut.map((id, i) => ({ group: "Next Four Out", team: id, seed: null, region: null, bid: null, ff: null, bubble: i + 5 }))];
const v = validateField(full, confOf);

// ---- facts for the write-ups
const rows = X.games.rows.filter((r) => r[7] != null);
const gamesOf = (id) => rows.filter((r) => r[4] === id || r[5] === id).map((r) => { const a = r[4] === id, me = a ? r[7] : r[8], op = a ? r[8] : r[7], o = byId.get(a ? r[5] : r[4]); return { day: r[1], type: r[2], ctx: r[3], win: me > op, me, op, opp: o.id, orank: o.rank, loc: r[6] === 0 ? "N" : a ? "A" : "H", ot: !!r[9] }; });
const sosRank = new Map([...T].sort((a, b) => b.sos - a.sos).map((t, i) => [t.id, i + 1]));
const confStanding = (t) => { const mates = T.filter((x) => x.conf === t.conf).sort((a, b) => (b.confW / Math.max(1, b.confW + b.confL)) - (a.confW / Math.max(1, a.confW + a.confL)) || b.rating - a.rating); return mates.findIndex((x) => x.id === t.id) + 1; };
const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]);
const ctWord = { "Big 10": "Big 10", "Big 12": "Big 12" };
const win = (g) => `${g.loc === "A" ? "a road win at" : g.loc === "N" ? "a neutral-court win over" : "a home win over"} No. ${g.orank}-rated ${nameOf(g.opp)}, ${g.me}-${g.op}`;
const hash = (n) => { let h = n * 2654435761 % 4294967296; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return h; };
const pick = (arr, id, salt = 0) => arr[hash(id * 31 + salt) % arr.length];

function facts(t) {
  const gs = gamesOf(t.id), reg = gs.filter((g) => g.type !== "CT"), ct = gs.filter((g) => g.type === "CT");
  const wins = reg.filter((g) => g.win).sort((a, b) => a.orank - b.orank), losses = reg.filter((g) => !g.win).sort((a, b) => b.orank - a.orank);
  const finalG = ct.length ? ct[ct.length - 1] : null;
  return { gs, reg, ct, best: wins[0], second: wins[1], worst: losses[0], bad: losses.filter((g) => g.orank > 100).length, finalG, road: reg.filter((g) => g.loc !== "H"), roadW: reg.filter((g) => g.loc !== "H" && g.win).length };
}

function blurb(t, isAuto) {
  const f = facts(t), conf = t.conf, rec = `${t.W}-${t.L}`, crec = `${t.confW}-${t.confL}`;
  let lead;
  if (isAuto) {
    const fin = f.finalG, beat = fin && fin.win ? ` over ${nameOf(fin.opp)}` : "";
    lead = pick([`${rec}, ${crec} in the ${conf}, and the ${conf} tournament title${beat ? beat.replace(" over", ", beating") + " " + fin.me + "-" + fin.op + " in the final" : ""}.`, `${rec} and ${conf} tournament champions${beat ? beat.replace(" over", ", beating") + " " + fin.me + "-" + fin.op + " in the final" : ""}.`], t.id);
  } else {
    const place = confStanding(t), wonCt = f.ct.filter((g) => g.win).length;
    const where = place <= 3 && t.confW + t.confL ? `${ordinal(place)} in the ${conf} at ${crec}` : `${crec} in the ${conf}`;
    const run = wonCt >= 2 ? `, then won ${wonCt} games at the conference tournament` : f.ct.length && !wonCt ? ", then out early at the conference tournament" : "";
    lead = `${rec}, ${where}${run}.`;
  }
  const opts = [];
  if (f.best && f.best.orank <= (isAuto ? 60 : 80)) opts.push(["best", `Best win: ${win(f.best)}.`]);
  if (t.q1w >= 3) opts.push(["q", `${t.q1w} wins over top-25 teams.`]);
  else if (t.q1w + t.q2w >= 5) opts.push(["q", `${t.q1w + t.q2w} wins over top-50 teams.`]);
  if (sosRank.get(t.id) <= 12) opts.push(["sos", `Played the ${ordinal(sosRank.get(t.id))}-toughest schedule in the country.`]);
  if (!isAuto && f.bad === 0 && t.L <= 12) opts.push(["bad", "Not one loss to a team outside the top 100."]);
  else if (!isAuto && f.bad >= 4) opts.push(["bad", `${f.bad} losses to teams outside the top 100 will draw questions.`]);
  if (f.roadW / Math.max(1, f.road.length) >= .72 && f.road.length >= 12) opts.push(["road", `${f.roadW}-${f.road.length - f.roadW} away from home.`]);
  if (t.margin >= 11) opts.push(["margin", `Outscored opponents by ${t.margin.toFixed(1)} points a game.`]);
  if (/^(9-1|10-0)$/.test(t.last10)) opts.push(["l10", `${t.last10} in the last ten.`]);
  if (isAuto && t.rank > 100) opts.push(["long", `Rated ${ordinal(t.rank)} in the power ratings, so the title is the whole case.`]);
  const take = []; const order = isAuto && t.rank > 100 ? ["long", "best", "q", "road", "l10", "margin", "sos", "bad"] : ["best", "q", "sos", "bad", "margin", "road", "l10", "long"];
  for (const k of order) { const o = opts.find((x) => x[0] === k); if (o && take.length < 2) take.push(o[1]); }
  let txt = [lead, ...take].join(" ");
  while (txt.split(/\s+/).length > 36 && take.length > 1) { take.pop(); txt = [lead, ...take].join(" "); }
  return txt;
}

function whyOut(t, rank) {
  const f = facts(t), conf = t.conf, rec = `${t.W}-${t.L}`;
  const reasons = [];
  if (f.bad >= 3) reasons.push(`${f.bad} losses to teams outside the top 100`);
  if (t.q1w === 0) reasons.push("no win over a top-25 team");
  else if (t.q1w + t.q2w <= 2) reasons.push(`just ${t.q1w + t.q2w} win${t.q1w + t.q2w === 1 ? "" : "s"} over the top 50`);
  const r10 = t.last10.split("-").map(Number); if (r10[0] <= 5) reasons.push(`only ${t.last10} in the last ten`);
  if (f.road.length >= 10 && f.roadW / f.road.length < .5) reasons.push(`a ${f.roadW}-${f.road.length - f.roadW} record away from home`);
  const good = f.best && f.best.orank <= 25 ? `Best win: ${win(f.best)}.` : "";
  const why = reasons.length ? `Left out over ${reasons.slice(0, 2).join(" and ")}.` : "Just missed the cut on a thin set of quality wins.";
  return `${rec}, ${t.confW}-${t.confL} in the ${conf}. ${good ? good + " " : ""}${why}`.replace(/\s+/g, " ");
}

// ---- assemble outputs
const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
const out = [];
for (const R of REGIONS) {
  SEED_ORDER.forEach((sd, slotIndex) => {
    const here = field.filter((p) => p.region === R && p.seed === sd);
    here.sort((a, b) => score(byId.get(b.team)) - score(byId.get(a.team)));
    here.forEach((p, k) => { const t = byId.get(p.team), name = nameOf(t.id); out.push({ id: t.id, name, slug: LEAGUE[t.id].slug, logo: "assets/logos/" + LOGOS[LEAGUE[t.id].slug].f, seed: sd, region: R, slotIndex, bid: p.bid, ff: p.ff, ffPos: p.ff ? k : null, rec: `${t.W}-${t.L}`, conf: t.conf, blurb: blurb(t, p.bid === "Auto"), confRec: `${t.confW}-${t.confL}` }); });
  });
}
const outs = [...CFG.firstFourOut, ...CFG.nextFourOut].map((id, i) => { const t = byId.get(id); return { id, name: nameOf(id), slug: LEAGUE[id].slug, logo: "assets/logos/" + LOGOS[LEAGUE[id].slug].f, rank: i + 1, group: i < 4 ? "FIRST FOUR OUT" : "NEXT FOUR OUT", rec: `${t.W}-${t.L}`, conf: t.conf, blurb: whyOut(t, i + 1) }; });
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "field.json"), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(outDir, "outs.json"), JSON.stringify(outs, null, 1));
fs.writeFileSync(path.join(outDir, "picks.json"), JSON.stringify(full, null, 1));
const words = out.map((o) => o.blurb.split(/\s+/).length);
console.log("field teams:", out.length, "| auto:", out.filter((o) => o.bid === "Auto").length, "| at-large:", out.filter((o) => o.bid !== "Auto").length, "| play-in teams:", out.filter((o) => o.ff).length);
console.log("conference conflicts left after separation:", left, "| validateField errors:", v.errors.length, v.errors.slice(0, 2).map((e) => e.replace(/\(.*?\)/g, "")), "| warnings:", v.warnings.length);
console.log("blurb words min/avg/max:", Math.min(...words), (words.reduce((a, b) => a + b, 0) / words.length).toFixed(1), Math.max(...words), "| outs:", outs.length);
const lines = [...new Set(out.filter((o) => o.ff).map((o) => `game${o.ff}@line${o.seed}`))].sort();
console.log("play-in games sit at:", lines.join(", "));
