// The Dayton Rule (Season 3 week 9): a First Four game is one bracket slot, seeded where its two teams belong on the
// S-curve (the average of their Seed Scores), not pinned to the 11 and 16 lines.
import test from "node:test";
import assert from "node:assert/strict";
import { suggestField, validateField } from "../js/league/field.js";

// 31 conferences x 8 teams: 11 big ones and 20 small ones. `champBoost` sets how good the small-conference champions are.
function rows(champBoost) {
  const out = []; let id = 0;
  for (let c = 0; c < 31; c++) for (let k = 0; k < 8; k++) {
    const big = c < 11, s = big ? 40 - k * 3 - c * 0.3 : (k === 0 ? champBoost - (c - 11) * 0.5 : -20 - k);
    out.push({ team: id++, conf: `C${c}`, score: s, seedScore: s });
  }
  return out;
}
const ffSeeds = (picks) => { const m = new Map(); for (const p of picks) if (p.ff) m.set(p.ff, p.seed); return m; };

test("normal year: the at-large games land around the 11-12 line and the auto-bid games on the 16 line", () => {
  const picks = suggestField(rows(-5), 37);
  assert.deepEqual(validateField(picks).errors, []);
  const s = ffSeeds(picks);
  assert.ok(s.get(1) >= 10 && s.get(1) <= 13, `game 1 on the ${s.get(1)} line`);
  assert.equal(s.get(3), 16); assert.equal(s.get(4), 16);
});

test("strong small-conference champions push the last four at-large below them", () => {
  const picks = suggestField(rows(30), 37);
  assert.deepEqual(validateField(picks).errors, []);
  const s = ffSeeds(picks);
  const champSeeds = picks.filter((p) => p.bid === "Auto" && !p.ff && p.team >= 11 * 8).map((p) => p.seed);
  assert.ok(s.get(1) > Math.min(...champSeeds), "the last four in are seeded below the best small-conference champions");
  for (const g of [1, 2, 3, 4]) assert.equal(picks.filter((p) => p.ff === g).length, 2);
  assert.ok(picks.filter((p) => p.ff === 1 || p.ff === 2).every((p) => p.bid === "At-large"));
  assert.ok(picks.filter((p) => p.ff === 3 || p.ff === 4).every((p) => p.bid === "Auto"));
});
