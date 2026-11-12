// The recorded-game engine: box-score invariants + distribution check against the workbook's 1,000 frozen average-vs-average games.
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, readJSON } from "./util.mjs";
import { playRecordedGame, makeRng } from "../js/engine.js";

const real = readJSON("tools/fixtures/teams-real.json"), avg = real.find((r) => r[0] === "Average Team");
const cal = fixture("calibration-log"), CI = Object.fromEntries(cal.cols.map((c, i) => [c, i]));

test("box score invariants hold in 5,000 games: points = 2*FGM + 3PM + FTM, made <= attempted, rebounds and possessions consistent", () => {
  const rows = readJSON("data/seasons/season-2/teams.json"), L = readJSON("data/league.json");
  const eng = (id) => [L[id].name, rows[id].conf, ...rows[id].start];
  const rand = makeRng(99);
  for (let g = 0; g < 5000; g++) {
    const a = Math.floor(rand() * 365), b = Math.floor(rand() * 365); if (a === b) continue;
    const r = playRecordedGame(eng(a), eng(b), g % 3 === 0 ? "neutral" : "B_home", { seed: g + 1 });
    for (const [bx, pts] of [[r.boxA, r.ptsA], [r.boxB, r.ptsB]]) {
      assert.equal(2 * bx.FGM + bx.TPM + bx.FTM, pts, `points identity (seed ${g + 1})`);
      assert.ok(bx.FGM <= bx.FGA && bx.TPM <= bx.TPA && bx.TPM <= bx.FGM && bx.FTM <= bx.FTA);
      assert.ok(Math.abs(bx.POSS - ((bx.FGA - bx.OR) + bx.TO + 0.437 * bx.FTA)) < 1e-9);
    }
    assert.notEqual(r.ptsA, r.ptsB, "no ties");
    assert.ok(r.ot >= 0 && r.ot < 6);
  }
});

test("average team vs average team (neutral, Team B opens): matches the workbook's Calibration Log within sampling error", () => {
  const N = 20000, sums = {}, sq = {};
  const keys = ["PTS", "FGA", "FGM", "3PA", "3PM", "FTA", "FTM", "TO", "ST", "OR", "DR"];
  const push = (k, v) => { sums[k] = (sums[k] || 0) + v; sq[k] = (sq[k] || 0) + v * v; };
  let ots = 0, aWins = 0, n = 0;
  for (let g = 0; g < N; g++) {
    const r = playRecordedGame(avg, avg, "neutral", { seed: 7000 + g });
    ots += r.ot > 0 ? 1 : 0; aWins += r.ptsA > r.ptsB ? 1 : 0;
    for (const [bx, pts] of [[r.boxA, r.ptsA], [r.boxB, r.ptsB]]) {
      n++; push("PTS", pts); push("FGA", bx.FGA); push("FGM", bx.FGM); push("3PA", bx.TPA); push("3PM", bx.TPM); push("FTA", bx.FTA); push("FTM", bx.FTM);
      push("TO", bx.TO); push("ST", bx.ST); push("OR", bx.OR); push("DR", bx.DR);
    }
  }
  const lines = [];
  for (const k of keys) {
    const col = cal.rows.map((r) => r[CI[k]]), m0 = col.reduce((s, x) => s + x, 0) / col.length, v0 = col.reduce((s, x) => s + (x - m0) ** 2, 0) / col.length;
    const m1 = sums[k] / n, v1 = sq[k] / n - m1 * m1, z = (m1 - m0) / Math.sqrt(v0 / col.length + v1 / n);
    lines.push(`${k.padEnd(4)} workbook ${m0.toFixed(3)}  site ${m1.toFixed(3)}  z=${z.toFixed(2)}`);
    assert.ok(Math.abs(z) < 4, `${k}: z = ${z.toFixed(2)} (workbook ${m0.toFixed(3)}, site ${m1.toFixed(3)})`);
  }
  const otCal = cal.rows.reduce((s, r) => s + (r[CI.OT] > 0 ? 1 : 0), 0) / 2 / 1000, otMine = ots / N;
  lines.push(`OT games  workbook ${(otCal * 100).toFixed(1)}%  site ${(otMine * 100).toFixed(1)}%  | Slot A (Team B opens) wins workbook ${(cal.rows.filter((r) => r[CI.Slot] === "A").reduce((s, r, i) => s, 0), "")} site ${(aWins / N * 100).toFixed(1)}%`);
  console.log("      " + lines.join("\n      "));
  assert.ok(Math.abs(otMine - otCal) < 0.015, "OT rate");
  assert.ok(aWins / N > 0.46 && aWins / N < 0.52, "slot A win share near the workbook's 49%");
});
