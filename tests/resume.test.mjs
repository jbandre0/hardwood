import test from "node:test";
import assert from "node:assert/strict";
import { computeResume, quadrant, RESUME_DEFAULTS } from "../js/league/resume.js";
import { computeBoard, BOARD_DEFAULTS } from "../js/league/bracketology.js";

test("quadrants follow the NET lines by venue", () => {
  assert.equal(quadrant(30, "home"), 1); assert.equal(quadrant(31, "home"), 2);
  assert.equal(quadrant(50, "neutral"), 1); assert.equal(quadrant(75, "away"), 1); assert.equal(quadrant(76, "away"), 2);
  assert.equal(quadrant(160, "home"), 3); assert.equal(quadrant(161, "home"), 4); assert.equal(quadrant(240, "away"), 3);
});

// 60 teams rated 30 down to -29; home 1 = b hosts
const teams = Array.from({ length: 60 }, (_, i) => ({ id: i, conf: "C" + (i % 6), rating: 30 - i, eff: 30 - i }));
const g = (a, b, ptsA, ptsB, home = 1, day = 1) => ({ day, type: "Reg", a, b, home, ptsA, ptsB });

test("WAB rewards a road win over a top team far more than a home win over a weak one", () => {
  const R = computeResume({ teams, games: [g(10, 0, 70, 60), g(55, 11, 60, 70)] });
  assert.ok(R.rows[10].wab > 0.7, "road win at the No. 1 team: " + R.rows[10].wab);
  assert.ok(R.rows[11].wab > 0 && R.rows[11].wab < 0.15, "home win over No. 56: " + R.rows[11].wab);
  assert.ok(R.rows[0].wab < 0 && R.rows[0].wab > -0.3, "home loss to No. 11 costs the top team a little");
  assert.ok(R.rows[55].wab > -0.1, "a road loss at a good team costs a bad team almost nothing");
  assert.equal(R.bubble, 30 - (RESUME_DEFAULTS.bubbleRank - 1));
  assert.deepEqual(R.rows[10].q[0], [1, 0], "road win at No. 1 is Q1");
  assert.deepEqual(R.rows[11].q[1], [1, 0], "home win over No. 56 is Q2 (home Q2 runs to 75)");
  assert.equal(R.rows[30].rank, null, "teams without games have no résumé rank");
});

test("unplayed games and games after throughDay are ignored", () => {
  const R = computeResume({ teams, games: [g(1, 2, null, null), g(1, 2, 80, 60, 1, 9)], throughDay: 5 });
  assert.equal(R.rows[1].gp, 0);
});

test("the default Board blends power rating and résumé half and half", () => {
  assert.equal(BOARD_DEFAULTS.formula, "resume");
  const games = [g(20, 0, 70, 60), g(20, 1, 70, 60), g(21, 59, 90, 40, 0), g(21, 58, 90, 40, 0)];
  const { rows } = computeBoard({ teams, games, throughDay: 47, picks: [], commAdj: [{ team: 5, adj: 1 }], settings: {} });
  for (const r of rows) assert.ok(Math.abs(r.score - (0.5 * r.rating + 0.5 * r.resumeRating + r.adj + r.rating / 1000)) < 1e-9);
  assert.equal(rows[5].adj, 1);
  // two road wins at top-2 teams beat two neutral blowouts of the two worst teams, for teams one rating point apart
  assert.ok(rows[20].score > rows[21].score + 0.5, "quality wins count");
  assert.equal(rows[20].q1w, 2); assert.equal(rows[21].q1w, 0);
  const legacy = computeBoard({ teams, games, throughDay: 47, picks: [], commAdj: [], settings: { formula: "workbook" } }).rows;
  assert.ok(Math.abs(legacy[20].score - legacy[21].score - (1.001 + 2 * 1.5)) < 1e-9, "workbook formula unchanged");
});
