#!/usr/bin/env node
// Publish a weekly bracketology edition to the site (data/editions.json).
//   node tools/publish_edition.mjs <draft.json> --export <season-export.json> [--replace] [--dry-run]
// The draft names teams by their canonical names (league.json). Everything is validated before anything is written:
// 68 teams, 4 per seed line per region except the First Four pairs, one automatic bid per conference held by a team of
// that conference, no team twice, bubble lists, an AP ballot of 25 distinct teams (optional), and the article
// (headline + body, no em dashes). Exit code 1 with a list of problems if anything is off.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateField } from "../js/league/field.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), flag = (f) => args.includes(f), opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const draftPath = args.find((a) => !a.startsWith("--") && a !== opt("--export"));
if (!draftPath || !opt("--export")) { console.error("usage: node tools/publish_edition.mjs <draft.json> --export <season-export.json> [--replace] [--dry-run]"); process.exit(2); }
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8")), X = JSON.parse(fs.readFileSync(opt("--export"), "utf8"));
const league = JSON.parse(fs.readFileSync(path.join(ROOT, "data/league.json"), "utf8"));
const errors = [], warnings = [];
const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const byNorm = new Map(league.map((t) => [norm(t.name), t.id]));
const idOf = (name) => {
  if (typeof name === "number") return name;
  const id = byNorm.get(norm(name));
  if (id == null) { const q = norm(name), near = league.filter((t) => norm(t.name).includes(q) || q.includes(norm(t.name))).map((t) => t.name).slice(0, 4); errors.push(`Unknown team "${name}"${near.length ? ` (did you mean ${near.join(", ")}?)` : ""}`); }
  return id;
};
const season = draft.season || X.season.id, week = draft.week, afterDay = draft.afterDay ?? X.throughDay;
if (season !== X.season.id) errors.push(`Draft is for ${season} but the export is ${X.season.id}`);
if (!Number.isInteger(week) || week < 0) errors.push("week must be a whole number (0 = preseason)");
if (afterDay > X.throughDay) errors.push(`afterDay ${afterDay} is past the last played day (${X.throughDay})`);
const confOf = new Map(X.teams.map((t) => [t.id, t.conf]));

const picks = [];
for (const f of draft.field || []) picks.push({ group: "Field", team: idOf(f.team), seed: f.seed, region: f.region, bid: f.bid === "Auto" ? "Auto" : "At-large", ff: f.ff || null, bubble: null, note: f.note || "" });
(draft.firstFourOut || []).forEach((n, i) => picks.push({ group: "First Four Out", team: idOf(n), seed: null, region: null, bid: null, ff: null, bubble: i + 1, note: "" }));
(draft.nextFourOut || []).forEach((n, i) => picks.push({ group: "Next Four Out", team: idOf(n), seed: null, region: null, bid: null, ff: null, bubble: i + 5, note: "" }));
if (!errors.length) {
  const v = validateField(picks); errors.push(...v.errors); warnings.push(...v.warnings);
  const autos = picks.filter((p) => p.group === "Field" && p.bid === "Auto"), byConf = new Map();
  for (const p of autos) { const k = confOf.get(p.team); byConf.set(k, [...(byConf.get(k) || []), p.team]); }
  for (const k of new Set(confOf.values())) {
    const n = (byConf.get(k) || []).length;
    if (n === 0) errors.push(`${k} has no automatic bid in the field`);
    if (n > 1) errors.push(`${k} has ${n} automatic bids: ${byConf.get(k).map((id) => league[id].name).join(", ")}`);
  }
  const atLarge = picks.filter((p) => p.group === "Field" && p.bid !== "Auto").length;
  if (atLarge !== 37) errors.push(`${atLarge} at-large bids (should be 37)`);
}
let ap = null;
if (draft.ap) {
  ap = draft.ap.map(idOf);
  if (ap.length !== 25) errors.push(`AP ballot has ${ap.length} teams (needs 25)`);
  if (new Set(ap).size !== ap.length) errors.push("AP ballot lists a team twice");
}
const headline = (draft.headline || "").trim(), body = (draft.body || "").trim();
if (!headline || !body) errors.push("headline and body are required");
let prose = headline + "\n" + body; for (const t of [...league].sort((a, b) => b.name.length - a.name.length)) prose = prose.split(t.name).join("");
if (/—/.test(prose)) errors.push("the article uses em dashes; the commissioner doesn't want them");
const words = body.split(/\s+/).filter(Boolean).length;
if (words < 900) warnings.push(`article is short (${words} words)`);
const file = path.join(ROOT, "data/editions.json"), all = JSON.parse(fs.readFileSync(file, "utf8"));
const list = all[season] || [];
if (list.some((e) => e.week === week) && !flag("--replace")) errors.push(`Week ${week} of ${season} is already published (use --replace to overwrite it)`);

if (errors.length) { console.error("NOT PUBLISHED. Fix these:\n- " + [...new Set(errors)].join("\n- ")); if (warnings.length) console.error("Warnings:\n- " + warnings.join("\n- ")); process.exit(1); }
const edition = { week, afterDay, publishedAt: new Date().toISOString(), headline, body, picks, ...(ap ? { ap } : {}), ...(draft.commAdj ? { commAdj: draft.commAdj.map((a) => ({ team: idOf(a.team), adj: a.adj, reason: a.reason || "" })) } : {}), words };
all[season] = [...list.filter((e) => e.week !== week), edition].sort((a, b) => a.week - b.week);
if (flag("--dry-run")) { console.log(`OK (dry run): ${season} week ${week}, ${picks.length} picks, ${words} words${ap ? ", AP ballot" : ""}`); }
else { fs.writeFileSync(file, JSON.stringify(all)); console.log(`Published ${season} week ${week}: "${headline}" (${words} words, ${picks.length} picks${ap ? ", AP ballot" : ""}) -> data/editions.json`); }
if (warnings.length) console.log("Warnings:\n- " + warnings.join("\n- "));
