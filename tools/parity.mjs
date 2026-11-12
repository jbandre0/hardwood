// Parity test: JS engine vs the workbook's Python engine on identical inputs.
// usage: node tools/parity.mjs   (needs python3 + numpy)
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { predict, makeRng } from "../js/engine.js";

const teams = JSON.parse(fs.readFileSync("data/teams.json"));
const real = JSON.parse(fs.readFileSync("tools/fixtures/teams-real.json"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "parity-"));

function runSet(label, rows, pairs) {
  const teamsFile = path.join(tmp, label + "-teams.json");
  const pairsFile = path.join(tmp, label + "-pairs.json");
  const outFile = path.join(tmp, label + "-out.json");
  fs.writeFileSync(teamsFile, JSON.stringify(rows));
  fs.writeFileSync(pairsFile, JSON.stringify(pairs));
  execFileSync("python3", ["-I", "tools/ref/run_pairs.py", pairsFile, outFile], { env: { ...process.env, TEAMS_JSON: teamsFile }, stdio: "inherit" });
  const py = JSON.parse(fs.readFileSync(outFile));
  const byName = Object.fromEntries(rows.map((r) => [r[0], r]));
  let worst = { p: 0, m: 0, t: 0 }, bad = 0;
  const lines = [];
  pairs.forEach(([a, b, v], i) => {
    const js = predict(byName[a], byName[b], v, { n: 40000, seed: 12345 + i, hist: false });
    const d = { p: Math.abs(js.p - py[i].p), m: Math.abs(js.margin - py[i].margin), t: Math.abs(js.total - py[i].total) };
    // tolerances ~ 4.5 standard errors of a difference of two 40k-game estimates
    const ok = d.p < 0.0113 * (1) && d.m < 0.46 && d.t < 0.38;
    if (!ok) bad++;
    for (const k in worst) worst[k] = Math.max(worst[k], d[k]);
    lines.push(`${ok ? "ok " : "BAD"} ${a} vs ${b} [${v}]  P(A) js ${js.p.toFixed(4)} py ${py[i].p.toFixed(4)} | margin js ${js.margin.toFixed(2)} py ${py[i].margin.toFixed(2)} | total js ${js.total.toFixed(1)} py ${py[i].total.toFixed(1)}`);
  });
  console.log(`\n== ${label}: ${pairs.length} matchups, ${bad} outside tolerance, worst diff P=${worst.p.toFixed(4)} margin=${worst.m.toFixed(3)} total=${worst.t.toFixed(3)}`);
  if (process.argv.includes("-v") || bad) console.log(lines.join("\n"));
  return bad;
}

// 1) fantasy teams: 40 seeded-random pairs, mixed venues
const rng = makeRng(2026);
const names = teams.map((t) => t.name);
const venues = ["neutral", "A_home", "B_home"];
const pairs = [];
for (let i = 0; i < 40; i++) {
  const a = names[Math.floor(rng() * names.length)];
  let b = names[Math.floor(rng() * names.length)];
  if (a === b) b = names[(names.indexOf(a) + 1) % names.length];
  pairs.push([a, b, venues[i % 3]]);
}
// plus the title game
pairs.push(["Virginia", "Seton Hall", "neutral"]);
let bad = runSet("fantasy", teams.map((t) => t.eng), pairs);

// 2) real-team table: documented anchors from the workbook notes
const realPairs = [["Duke", "Uconn", "neutral"], ["BYU", "Howard", "neutral"], ["Kansas", "Iowa St.", "A_home"], ["Kansas", "Iowa St.", "neutral"], ["Average Team", "Average Team", "neutral"]];
bad += runSet("real", real, realPairs);

const byReal = Object.fromEntries(real.map((r) => [r[0], r]));
const avg = predict(byReal["Average Team"], byReal["Average Team"], "neutral", { n: 40000, seed: 5, hist: false });
const duke = predict(byReal["Duke"], byReal["Uconn"], "neutral", { n: 40000, seed: 5, hist: false });
console.log(`\nAnchors from workbook notes: Duke-UConn neutral P(Duke) = ${duke.p.toFixed(3)} (notes say ~0.66); Average vs Average P = ${avg.p.toFixed(3)}, PPG ${avg.scoreA.toFixed(1)} (target 75.8)`);
process.exit(bad ? 1 : 0);
