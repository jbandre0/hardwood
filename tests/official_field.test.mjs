// The committee's official field (data/seasons/season-2/ncaa.json, "official": true) replaces a field built in the
// browser until the NCAA tournament starts, and the generated NCAA games follow it.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readJSON } from "./util.mjs";
import { loadSeasonData, createState, adoptOfficialField } from "../js/league/league.js";

const key = (f) => f.map((x) => `${x.team}|${x.seed}|${x.region}|${x.ff || 0}`).sort().join(",");

test("an official published field replaces a browser-built field before the tournament", async () => {
  const data = await loadSeasonData("season-2", async (p) => readJSON(p));
  assert.equal(data.ncaa.official, true);
  const alt = data.ncaa.field.map((x) => ({ ...x }));
  const a = alt.find((x) => x.seed === 1), b = alt.find((x) => x.seed === 2 && x.region !== a.region);
  [a.team, b.team] = [b.team, a.team];                               // a different (browser-built) field
  const st = createState(data, { format: 1, games: {}, box: {}, order: [], content: { field: alt } });
  assert.equal(key(st.content.field), key(data.ncaa.field));
  assert.ok(st.contentDirty.has("field"), "the swap is saved with the next save");
  assert.equal(adoptOfficialField(st), false, "idempotent");
});

// Optional: the commissioner's real browser data (git-ignored export), when present in this checkout.
const EXPORT = "exports/hardwood-season-2-through-day-47.json";
test("with the commissioner's day-47 data, the NCAA games use the official field", { skip: !fs.existsSync(EXPORT) }, async () => {
  const data = await loadSeasonData("season-2", async (p) => readJSON(p));
  const ex = JSON.parse(fs.readFileSync(EXPORT, "utf8"));
  const st = createState(data, ex.backup.overlays["season-2"]);
  assert.equal(key(st.content.field), key(data.ncaa.field));
  const ncaa = st.games.filter((g) => g.type === "NCAA");
  assert.equal(ncaa.length, 32, "First Four plus the 28 first-round games whose teams are known");
  const inField = new Set(data.ncaa.field.map((x) => x.team));
  for (const g of ncaa) if (g.a != null) { assert.ok(inField.has(g.a) && inField.has(g.b), `game ${g.id} uses official teams`); }
  const seed = new Map(data.ncaa.field.map((x) => [x.team, x]));
  for (const g of ncaa.filter((g) => g.day === 48)) assert.equal(seed.get(g.a).ff, seed.get(g.b).ff, "First Four pairs match the official field");
});
