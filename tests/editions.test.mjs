import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { readJSON, ROOT } from "./util.mjs";
import { loadSeasonData, createState } from "../js/league/league.js";
import { buildSeasonExport } from "../js/league/export.js";

const data = await loadSeasonData("season-2", async (p) => readJSON(p));
const st = createState(data), L = data.league;
const TMP = fs.mkdtempSync("/tmp/hw-ed-");
fs.writeFileSync(`${TMP}/export.json`, JSON.stringify(buildSeasonExport(st, { id: "season-2", label: "Season 2" })));
// a draft built from the real week 4 field, renamed week 5
const w4 = st.content.picks.filter((p) => p.week === 4);
const body = Array.from({ length: 60 }, (_, i) => `Paragraph ${i} about the week, with plenty of words to read and nothing else to say here today.`).join("\n\n");
const draft = (over = {}) => ({ season: "season-2", week: 5, afterDay: 13, headline: "Week 5: A Test Edition", body,
  field: w4.filter((p) => p.group === "Field").map((p) => ({ team: L[p.team].name, seed: p.seed, region: p.region, bid: p.bid, ff: p.ff })),
  firstFourOut: w4.filter((p) => p.group === "First Four Out").map((p) => L[p.team].name), nextFourOut: w4.filter((p) => p.group === "Next Four Out").map((p) => L[p.team].name),
  ap: st.content.ap[st.content.ap.length - 1].ranks.map((id) => L[id].name), ...over });
const run = (d) => { fs.writeFileSync(`${TMP}/draft.json`, JSON.stringify(d)); try { return { ok: true, out: execFileSync("node", [`${ROOT}/tools/publish_edition.mjs`, `${TMP}/draft.json`, "--export", `${TMP}/export.json`, "--dry-run"], { encoding: "utf8", stdio: "pipe" }) }; } catch (e) { return { ok: false, out: e.stderr + e.stdout }; } };

test("publisher accepts a valid edition (dry run)", () => { const r = run(draft()); assert.ok(r.ok, r.out); assert.match(r.out, /OK \(dry run\): season-2 week 5/); });
test("publisher rejects unknown teams, two auto bids in a conference, em dashes, a short field", () => {
  const d1 = draft(); d1.field[0].team = "Alabamaa"; assert.match(run(d1).out, /Unknown team "Alabamaa"/);
  const d2 = draft(); const at = d2.field.find((f) => f.bid !== "Auto" && L.find((t) => t.name === f.team)); at.bid = "Auto"; assert.match(run(d2).out, /automatic bids|at-large/);
  assert.match(run(draft({ body: body + "\n\nA dash — here." })).out, /em dashes/);
  const d4 = draft(); d4.field.pop(); assert.ok(!run(d4).ok);
  assert.match(run(draft({ week: 4 })).out, /OK|already published/);
});
test("a published edition replaces that week's field, article and ballot on the site", () => {
  const e = { week: 4, afterDay: 12, publishedAt: "x", headline: "Week 4: Replaced", body: "New text", picks: w4.map((p) => ({ ...p, note: "ed" })), ap: st.content.ap[4].ranks.slice().reverse() };
  const s2 = createState({ ...data, editions: [e] });
  assert.ok(s2.content.picks.filter((p) => p.week === 4).every((p) => p.note === "ed"));
  const arts = s2.content.articles.filter((a) => a.week === 4); assert.equal(arts.length, 1); assert.equal(arts[0].headline, "Week 4: Replaced");
  assert.equal(s2.content.ap.find((b) => b.week === 4).ranks[0], st.content.ap[4].ranks[24]);
  assert.equal(s2.content.picks.filter((p) => p.week === 3).length, st.content.picks.filter((p) => p.week === 3).length);
});
