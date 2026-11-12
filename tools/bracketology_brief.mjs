#!/usr/bin/env node
// Turn a season export into a readable brief for writing the week's bracketology (no forecasts, just the facts).
//   node tools/bracketology_brief.mjs <season-export.json> [--since <day>] > brief.md
import fs from "node:fs";
const args = process.argv.slice(2), file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--since");
const X = JSON.parse(fs.readFileSync(file, "utf8"));
const since = args.includes("--since") ? +args[args.indexOf("--since") + 1] : (X.lastEdition.afterDay || 0) + 1;
const T = X.teams, nm = (id) => T[id].name, C = Object.fromEntries(X.games.cols.map((k, i) => [k, i]));
const G = X.games.rows.map((r) => ({ id: r[C.id], day: r[C.day], type: r[C.type], ctx: r[C.ctx], a: r[C.a], b: r[C.b], home: r[C.home], pa: r[C.ptsA], pb: r[C.ptsB], ot: r[C.ot] }));
const HFA = 3.7, then = (id) => T[id].sinceLastEdition.ratingThen ?? T[id].tierRating;
const wk = G.filter((g) => g.day >= since);
const out = [], P = (s = "") => out.push(s);
const rec = (id) => `${T[id].W}-${T[id].L}`, rk = (id) => (T[id].rank ? `#${T[id].rank}` : "unr.");
const score = (g) => { const aw = g.pa > g.pb; return `${aw ? "**" + nm(g.a) + "**" : nm(g.a)} ${g.pa}, ${aw ? nm(g.b) : "**" + nm(g.b) + "**"} ${g.pb}${g.ot ? ` (${g.ot > 1 ? g.ot : ""}OT)` : ""}${g.home ? ` @ ${nm(g.b)}` : " (neutral)"}`; };
const lastField = X.bracketology.picks.filter((p) => p.week === X.lastEdition.week);
const inField = new Map(lastField.map((p) => [p.team, p]));

P(`# Bracketology brief: ${X.season.label}, week ${X.nextWeek}`);
P(`Through day ${X.throughDay} (${X.gamesPlayed.toLocaleString()} of ${X.gamesScheduled.toLocaleString()} games). This week = days ${since}-${X.throughDay}, ${wk.length} games. Last edition: week ${X.lastEdition.week} after day ${X.lastEdition.afterDay}.`);
P(`Phase: ${X.throughDay <= 20 ? "non-conference (days 1-20)" : X.throughDay <= 42 ? "conference play (days 21-42)" : X.throughDay <= 47 ? "conference tournaments (43-47)" : "NCAA tournament"}.`);

// upsets by the ratings going into the week
const graded = wk.map((g) => { const w = g.pa > g.pb ? g.a : g.b, l = w === g.a ? g.b : g.a, edge = g.home ? (w === g.b ? HFA : -HFA) : 0; return { g, w, l, exp: then(w) - then(l) + edge, margin: Math.abs(g.pa - g.pb) }; });
P(`\n## Upsets (by the ratings going into the week; expected margin for the winner)`);
for (const x of graded.filter((x) => x.exp < -4).sort((a, b) => a.exp - b.exp).slice(0, 25)) P(`- Day ${x.g.day}: ${score(x.g)}. Expected ${x.exp.toFixed(1)}. ${nm(x.w)} now ${rec(x.w)} ${rk(x.w)}; ${nm(x.l)} now ${rec(x.l)} ${rk(x.l)}${inField.has(x.l) ? ` (${inField.get(x.l).group === "Field" ? "was a " + inField.get(x.l).seed + " seed" : "was on the bubble"})` : ""}.`);
P(`\n## Games that matter (both teams top 75, or a field/bubble team involved)`);
const matters = graded.filter((x) => (T[x.g.a].rank <= 75 && T[x.g.b].rank <= 75) || inField.has(x.g.a) || inField.has(x.g.b));
for (const x of matters.sort((a, b) => a.g.day - b.g.day || Math.min(T[a.g.a].rank, T[a.g.b].rank) - Math.min(T[b.g.a].rank, T[b.g.b].rank)).slice(0, 120)) P(`- D${x.g.day} ${x.g.type}: ${score(x.g)}`);

P(`\n## Unbeaten and winless`);
const unb = T.filter((t) => t.W + t.L && t.L === 0).sort((a, b) => b.W - a.W || b.rating - a.rating);
P(`Unbeaten (${unb.length}): ${unb.map((t) => `${t.name} ${t.W}-0 (${t.conf})`).join(", ")}`);
const lostPerfect = graded.filter((x) => { const t = T[x.l]; return t.L === 1 && t.sinceLastEdition.recordThen.endsWith("-0"); });
if (lostPerfect.length) P(`Lost their perfect record this week: ${lostPerfect.map((x) => `${nm(x.l)} (to ${nm(x.w)}, ${x.g.pa}-${x.g.pb})`).join("; ")}`);
const winless = T.filter((t) => t.W + t.L && t.W === 0);
P(`Winless (${winless.length}): ${winless.map((t) => `${t.name} 0-${t.L}`).join(", ")}`);

P(`\n## Risers and fallers (rating change since the last edition; top 100 now or then)`);
const mv = T.filter((t) => t.sinceLastEdition.ratingThen != null && (t.rank <= 100 || (t.sinceLastEdition.rankThen ?? 999) <= 100)).map((t) => ({ t, d: t.rating - t.sinceLastEdition.ratingThen })).sort((a, b) => b.d - a.d);
P("Up: " + mv.slice(0, 12).map(({ t, d }) => `${t.name} +${d.toFixed(1)} (#${t.sinceLastEdition.rankThen}->#${t.rank}, ${t.sinceLastEdition.recordThen}->${t.W}-${t.L})`).join("; "));
P("Down: " + mv.slice(-12).reverse().map(({ t, d }) => `${t.name} ${d.toFixed(1)} (#${t.sinceLastEdition.rankThen}->#${t.rank}, ${t.sinceLastEdition.recordThen}->${t.W}-${t.L})`).join("; "));

P(`\n## Patterns this week`);
const confWk = new Map();
for (const x of graded) if (x.g.type === "Reg") for (const [id, won] of [[x.w, 1], [x.l, 0]]) { const k = T[id].conf, r = confWk.get(k) || [0, 0]; r[won ? 0 : 1]++; confWk.set(k, r); }
P("Non-conference records this week: " + [...confWk].sort((a, b) => b[1][0] / (b[1][0] + b[1][1]) - a[1][0] / (a[1][0] + a[1][1])).map(([k, [w, l]]) => `${k} ${w}-${l}`).join(", "));
const homeG = wk.filter((g) => g.home), hw = homeG.filter((g) => g.pb > g.pa).length;
const pts = (gs) => gs.reduce((s, g) => s + g.pa + g.pb, 0) / Math.max(1, 2 * gs.length);
P(`Home teams ${hw}-${homeG.length - hw} this week (${(100 * hw / Math.max(1, homeG.length)).toFixed(1)}%). Scoring ${pts(wk).toFixed(1)} per team this week vs ${pts(G).toFixed(1)} season. Overtime games: ${wk.filter((g) => g.ot).length}. Margins of 40+: ${graded.filter((x) => x.margin >= 40).length}. Decided by 3 or fewer: ${graded.filter((x) => x.margin <= 3).length}.`);
const tierWk = new Map(); for (const x of graded) for (const [id, won] of [[x.w, 1], [x.l, 0]]) { const k = T[id].tier, r = tierWk.get(k) || [0, 0]; r[won ? 0 : 1]++; tierWk.set(k, r); }
P("By tier this week: " + ["S", "A", "B", "C", "D", "F"].map((k) => { const r = tierWk.get(k) || [0, 0]; return `${k} ${r[0]}-${r[1]}`; }).join(", "));
const busters = [...T].filter((t) => t.W + t.L >= 4).map((t) => ({ t, gap: t.rating - t.tierRating })).sort((a, b) => b.gap - a.gap);
P("Playing above their tier: " + busters.slice(0, 8).map(({ t, gap }) => `${t.name} (Tier ${t.tier}, +${gap.toFixed(1)}, ${t.W}-${t.L})`).join("; "));
P("Below their tier: " + busters.slice(-8).reverse().map(({ t, gap }) => `${t.name} (Tier ${t.tier}, ${gap.toFixed(1)}, ${t.W}-${t.L})`).join("; "));

P(`\n## Conference standings (top 5; conf record, overall, rank)`);
for (const [k, ids] of Object.entries(X.standings)) P(`- **${k}**: ` + ids.slice(0, 5).map((id) => `${nm(id)} ${T[id].confW}-${T[id].confL} (${rec(id)}, ${rk(id)})`).join("; "));

P(`\n## Board (resume score = rating + win% + quality wins - bad losses), top 80`);
P(`Q1 = win over a top-${X.boardSettings.q1Rank} rated team, Q2 = top ${X.boardSettings.q2Rank}, bad loss = loss to a team outside the top ${X.boardSettings.badLossRank}.`);
[...T].sort((a, b) => b.boardScore - a.boardScore).slice(0, 80).forEach((t, i) => P(`${i + 1}. ${t.name} (${t.conf}, Tier ${t.tier}) ${rec(t.id)}, conf ${t.confW}-${t.confL}, rating ${t.rating} ${rk(t.id)}, SOS ${t.sos}, Q1 ${t.q1w}, Q2 ${t.q2w}, bad L ${t.badLosses}, last10 ${t.last10 || "-"}, score ${t.boardScore}${inField.has(t.id) ? ` [last week: ${inField.get(t.id).group === "Field" ? `${inField.get(t.id).seed} seed ${inField.get(t.id).region}${inField.get(t.id).bid === "Auto" ? " AQ" : ""}` : inField.get(t.id).group}]` : ""}`));

P(`\n## Last edition's field (week ${X.lastEdition.week}) with this week's record`);
for (let s = 1; s <= 16; s++) P(`- ${s}: ` + lastField.filter((p) => p.group === "Field" && p.seed === s).map((p) => { const d = graded.filter((x) => x.w === p.team || x.l === p.team), w = d.filter((x) => x.w === p.team).length; return `${nm(p.team)} (${p.region}${p.bid === "Auto" ? ", AQ" : ""}${p.ff ? ", FF" + p.ff : ""}; week ${w}-${d.length - w}, now ${rec(p.team)})`; }).join("; "));
P(`- First four out: ${lastField.filter((p) => p.group === "First Four Out").map((p) => nm(p.team)).join(", ")}. Next four out: ${lastField.filter((p) => p.group === "Next Four Out").map((p) => nm(p.team)).join(", ")}`);

P(`\n## Coming up (next 6 days, both teams top 60)`);
for (const u of X.upcoming.filter((u) => u[1] <= X.throughDay + 6 && T[u[3]].rank <= 60 && T[u[4]].rank <= 60).slice(0, 30)) P(`- Day ${u[1]}: ${nm(u[3])} (${rec(u[3])}, ${rk(u[3])}) ${u[5] ? "at" : "vs"} ${nm(u[4])} (${rec(u[4])}, ${rk(u[4])})`);
P(`\n## Previous editions (headlines, for continuity)`);
for (const a of X.bracketology.articles.filter((a) => /bracket/i.test(a.type || "Bracketology"))) P(`- Week ${a.week}: ${a.headline}`);
P(`\nLast AP ballot: ${X.ap.length ? X.ap[X.ap.length - 1].ranks.map((id, i) => `${i + 1}. ${nm(id)}`).join(", ") : "none"}`);
console.log(out.join("\n"));
