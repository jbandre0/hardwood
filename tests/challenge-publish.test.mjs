import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { readJSON, ROOT } from "./util.mjs";
import { loadSeasonData, createState, calc } from "../js/league/league.js";
import { chalkPicks } from "../js/league/challenge.js";

const data = await loadSeasonData("season-1", async (p) => readJSON(p));
const c = calc(createState(data)), L = data.league, field = data.ncaa.field;
const TMP = fs.mkdtempSync("/tmp/hw-ch-");
fs.writeFileSync(`${TMP}/export.json`, JSON.stringify({ season: { id: "season-1" }, ncaaField: field, teams: [] }));
const picks = chalkPicks(field, (id) => c.teams[id].stats.rating);
const words = Array.from({ length: 80 }, (_, i) => `Sentence ${i} of the writeup, with a handful of ordinary words in it for length.`).join(" ");
const draft = (over = {}) => ({ season: "season-1", headline: "The Chalk Bracket", writeup: words, winners: Object.fromEntries(Object.entries(picks).map(([id, t]) => [id, L[t].name])), ...over });
const run = (d) => { fs.writeFileSync(`${TMP}/d.json`, JSON.stringify(d)); try { return { ok: true, out: execFileSync("node", [`${ROOT}/tools/publish_challenge.mjs`, `${TMP}/d.json`, "--export", `${TMP}/export.json`, "--dry-run"], { encoding: "utf8", stdio: "pipe" }) }; } catch (e) { return { ok: false, out: e.stderr + e.stdout }; } };

test("HQ challenge filing accepts a complete valid bracket (dry run)", () => { const r = run(draft()); assert.ok(r.ok, r.out); assert.match(r.out, /63 picks/); });
test("HQ challenge filing rejects missing games, impossible picks, unknown teams, em dashes, and a missing field", () => {
  const d1 = draft(); delete d1.winners["5876"]; assert.match(run(d1).out, /5876|62 of 63|only set up/);
  const d2 = draft(); const g = Object.keys(d2.winners).find((k) => +k >= 5846); d2.winners[g] = L[0].name === d2.winners[g] ? L[1].name : L[0].name; assert.ok(!run(d2).ok);
  assert.match(run(draft({ winners: { ...draft().winners, 5814: "Notateam" } })).out, /Unknown team/);
  assert.match(run(draft({ writeup: words + " a dash — here" })).out, /em dashes/);
  fs.writeFileSync(`${TMP}/export.json`, JSON.stringify({ season: { id: "season-1" }, ncaaField: null, teams: [] }));
  assert.match(run(draft()).out, /field isn't set/);
});
