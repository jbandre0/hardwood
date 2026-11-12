import test from "node:test";
import assert from "node:assert/strict";
import { league, season } from "./util.mjs";
import { generateSchedule, validateSchedule, pairKey } from "../js/league/schedule.js";

const L = league(), T2 = season("season-2", "teams");
const teams = L.map((t) => ({ id: t.id, name: t.name, conf: T2[t.id].conf }));
const idOf = Object.fromEntries(L.map((t) => [t.name, t.id]));
const marquee = season("season-2", "marquee").map((m) => ({ a: idOf[m.visitor], b: idOf[m.host], site: m.site === "Neutral" ? "neutral" : "host", day: m.day || undefined }));
const prev = new Set(season("season-1", "games").rows.filter((g) => g[2] === "Reg").map((g) => pairKey(g[4], g[5])));
const real = season("season-2", "games").rows.map((g) => ({ id: g[0], day: g[1], type: g[2], a: g[4], b: g[5], home: g[6] }));
const SEEDS = { conference: 52719643, nonConference: 52719644 };

test("validator accepts the REAL Season 2 schedule from the workbook (marquee repeats exempt)", () => {
  const r = validateSchedule({ games: real, teams, prevNonConfPairs: prev, marquee });
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok);
});

test("validator catches tampering: wrong count, same-day double, repeat pair, bad conference, imbalance", () => {
  const bad = (mut) => { const g = real.map((x) => ({ ...x })); mut(g); return validateSchedule({ games: g, teams, prevNonConfPairs: prev, marquee }); };
  assert.ok(!bad((g) => g.pop()).ok, "missing game");
  assert.ok(!bad((g) => { g[1].day = g[0].day; g[1].a = g[0].a; }).ok, "same-day double");
  const reg = real.findIndex((g) => g.type === "Reg" && !marquee.some((m) => pairKey(m.a, m.b) === pairKey(g.a, g.b)));
  assert.ok(!bad((g) => { g[reg + 1] = { ...g[reg], id: g[reg + 1].id, day: g[reg + 1].day }; }).ok, "repeat pair");
  assert.ok(!bad((g) => { const c = g.findIndex((x) => x.type === "Conf"); [g[c].a, g[c].b] = [g[c].b, g[c].a]; }).ok, "home/away imbalance");
  assert.ok(!bad((g) => { const c = g.findIndex((x) => x.type === "Conf"); g[c].type = "Reg"; }).ok, "conference game typed non-conf");
});

test("generator: Season 2 inputs + the recorded seeds produce a fully valid schedule", () => {
  const { games, report } = generateSchedule({ teams, seeds: SEEDS, marquee, prevNonConfPairs: prev });
  assert.equal(games.length, 5475);
  assert.deepEqual(report.warnings, []);
  const v = validateSchedule({ games, teams, prevNonConfPairs: prev, marquee });
  assert.deepEqual(v.errors, []);
  // conference home/away exactly balanced (checked inside the validator); non-conference nearly so
  assert.ok(v.stats.maxNonConfImbalance <= 2, "non-conf imbalance " + v.stats.maxNonConfImbalance);
});

test("generator is deterministic per seed and different across seeds", () => {
  const a = generateSchedule({ teams, seeds: SEEDS, marquee, prevNonConfPairs: prev }).games;
  const b = generateSchedule({ teams, seeds: SEEDS, marquee, prevNonConfPairs: prev }).games;
  const c = generateSchedule({ teams, seeds: { conference: 1, nonConference: 2 }, marquee, prevNonConfPairs: prev }).games;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((g) => [g.a, g.b, g.day]), c.map((g) => [g.a, g.b, g.day]));
});

test("generator: 25 different seed pairs all validate (no unlucky seeds)", () => {
  for (let i = 0; i < 25; i++) {
    const { games } = generateSchedule({ teams, seeds: { conference: 1000 + i, nonConference: 9000 + i }, marquee, prevNonConfPairs: prev });
    const v = validateSchedule({ games, teams, prevNonConfPairs: prev, marquee });
    assert.deepEqual(v.errors, [], `seed ${i}`);
  }
});

test("generator without marquee games and without a previous season also validates", () => {
  const { games } = generateSchedule({ teams, seeds: { conference: 5, nonConference: 6 } });
  assert.deepEqual(validateSchedule({ games, teams }).errors, []);
});

test("generator rejects a marquee pair inside one conference and a duplicate marquee pair", () => {
  const same = teams.filter((t) => t.conf === "ACC").slice(0, 2);
  assert.throws(() => generateSchedule({ teams, seeds: SEEDS, marquee: [{ a: same[0].id, b: same[1].id, site: "host" }] }), /same conference/);
  assert.throws(() => generateSchedule({ teams, seeds: SEEDS, marquee: [marquee[0], marquee[0]] }), /twice/);
});
