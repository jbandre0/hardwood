#!/usr/bin/env node
// File Bracketology HQ's bracket-challenge entry (data/challenge.json).
//   node tools/publish_challenge.mjs <draft.json> --export <season-export.json> [--replace] [--dry-run]
// draft: { "season": "season-2", "headline": "...", "writeup": "...", "winners": { "5810": "Team Name", ... all 67 games } }
// The field comes from the export (ncaaField, set after the conference tournaments). Every pick must be one of the two
// teams in its game given the earlier picks; all 67 games must be picked; no em dashes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gamesFor, prunePicks } from "../js/league/challenge.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), flag = (f) => args.includes(f), opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const draftPath = args.find((a) => !a.startsWith("--") && a !== opt("--export"));
if (!draftPath || !opt("--export")) { console.error("usage: node tools/publish_challenge.mjs <draft.json> --export <season-export.json> [--replace] [--dry-run]"); process.exit(2); }
const draft = JSON.parse(fs.readFileSync(draftPath, "utf8")), X = JSON.parse(fs.readFileSync(opt("--export"), "utf8"));
const league = JSON.parse(fs.readFileSync(path.join(ROOT, "data/league.json"), "utf8"));
const errors = [], warnings = [];
const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const byNorm = new Map(league.map((t) => [norm(t.name), t.id]));
const idOf = (n) => { if (typeof n === "number") return n; const id = byNorm.get(norm(n)); if (id == null) errors.push(`Unknown team "${n}"`); return id; };
const season = draft.season || X.season.id;
if (season !== X.season.id) errors.push(`Draft is for ${season} but the export is ${X.season.id}`);
const field = X.ncaaField;
if (!field || field.length !== 68) errors.push("The NCAA field isn't set in this export yet (Commissioner desk: Build NCAA field after day 47), so there is no bracket to fill in.");
const picks = {};
for (const [id, name] of Object.entries(draft.winners || {})) picks[+id] = idOf(name);
if (!errors.length) {
  const kept = prunePicks(field, picks);
  for (const id of Object.keys(picks)) if (kept[id] == null) errors.push(`Game ${id}: ${league[picks[id]].name} isn't playing in that game given your earlier picks`);
  const games = gamesFor(field, kept);
  if (games.length !== 67) errors.push(`The picks only set up ${games.length} of 67 games`);
  for (const g of games) if (kept[g.id] == null) errors.push(`Game ${g.id} (${league[g.a].name} vs ${league[g.b].name}) has no pick`);
}
const headline = (draft.headline || "").trim(), writeup = (draft.writeup || "").trim();
if (!headline || !writeup) errors.push("headline and writeup are required");
let prose = headline + "\n" + writeup; for (const t of [...league].sort((a, b) => b.name.length - a.name.length)) prose = prose.split(t.name).join("");
if (/—/.test(prose)) errors.push("the writeup uses em dashes");
const words = writeup.split(/\s+/).filter(Boolean).length; if (words < 400) warnings.push(`writeup is short (${words} words)`);
const file = path.join(ROOT, "data/challenge.json"), all = JSON.parse(fs.readFileSync(file, "utf8"));
if (all[season] && all[season].hq && !flag("--replace")) errors.push(`Bracketology HQ already filed a bracket for ${season} (use --replace to overwrite it)`);
if (errors.length) { console.error("NOT FILED. Fix these:\n- " + [...new Set(errors)].join("\n- ")); if (warnings.length) console.error("Warnings:\n- " + warnings.join("\n- ")); process.exit(1); }
const entry = { headline, writeup, picks, words, filedAt: new Date().toISOString() };
if (flag("--dry-run")) console.log(`OK (dry run): ${season}, 67 picks, champion ${league[picks[5876]].name}, ${words} words`);
else { all[season] = { ...(all[season] || {}), hq: entry }; fs.writeFileSync(file, JSON.stringify(all)); console.log(`Filed ${season}: champion ${league[picks[5876]].name} (${words} words) -> data/challenge.json`); }
if (warnings.length) console.log("Warnings:\n- " + warnings.join("\n- "));
