#!/usr/bin/env node
// File Bracketology HQ's bracket-challenge entry (data/challenge.json).
//   node tools/publish_challenge.mjs <draft.json> --export <season-export.json> [--replace] [--dry-run]
// draft: { "season": "season-2", "headline": "...", "writeup": "...", "winners": { "5814": "Team Name", ... all 63 games } }
// The First Four (5810-5813) is not picked, like ESPN: a play-in team in the round of 64 is its slot, written "First Four 1" ... "First Four 4"
// (or either team's name, which means the same slot).
// The field comes from the export (ncaaField, set after the conference tournaments). Every pick must be one of the two
// teams in its game given the earlier picks; all 63 games from the round of 64 on must be picked; no em dashes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gamesFor, prunePicks, PICK_COUNT, FIRST_PICK as PICK_FROM } from "../js/league/challenge.js";

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
// The committee's official field published to the repo (data/seasons/<season>/ncaa.json, "official": true) wins over the
// export's field, the same way the site adopts it over a field built in the browser.
const officialPath = path.join(ROOT, `data/seasons/${draft.season}/ncaa.json`);
const official = fs.existsSync(officialPath) ? JSON.parse(fs.readFileSync(officialPath, "utf8")) : null;
const field = official && official.official && official.field && official.field.length === 68 ? official.field : X.ncaaField;
if (!field || field.length !== 68) errors.push("The NCAA field isn't set in this export yet (Commissioner desk: Build NCAA field after day 47), so there is no bracket to fill in.");
const picks = {};
for (const [id, name] of Object.entries(draft.winners || {})) { if (+id < PICK_FROM) continue; const ff = /^first four ([1-4])$/i.exec(String(name).trim()); picks[+id] = ff ? -+ff[1] : idOf(name); }
if (!errors.length) {
  const kept = prunePicks(field, picks);
  const label = (t) => (t < 0 ? `First Four ${-t}` : league[t].name);
  for (const id of Object.keys(picks)) if (kept[id] == null) errors.push(`Game ${id}: ${label(picks[id])} isn't playing in that game given your earlier picks`);
  const games = gamesFor(field, kept);
  if (games.length !== PICK_COUNT) errors.push(`The picks only set up ${games.length} of ${PICK_COUNT} games`);
  for (const g of games) if (kept[g.id] == null) errors.push(`Game ${g.id} (${label(g.a)} vs ${label(g.b)}) has no pick`);
}
const headline = (draft.headline || "").trim(), writeup = (draft.writeup || "").trim();
if (!headline || !writeup) errors.push("headline and writeup are required");
let prose = headline + "\n" + writeup; for (const t of [...league].sort((a, b) => b.name.length - a.name.length)) prose = prose.split(t.name).join("");
if (/—/.test(prose)) errors.push("the writeup uses em dashes");
const words = writeup.split(/\s+/).filter(Boolean).length; if (words < 400) warnings.push(`writeup is short (${words} words)`);
const file = path.join(ROOT, "data/challenge.json"), all = JSON.parse(fs.readFileSync(file, "utf8"));
if (all[season] && all[season].hq && !flag("--replace")) errors.push(`Bracketology HQ already filed a bracket for ${season} (use --replace to overwrite it)`);
if (errors.length) { console.error("NOT FILED. Fix these:\n- " + [...new Set(errors)].join("\n- ")); if (warnings.length) console.error("Warnings:\n- " + warnings.join("\n- ")); process.exit(1); }
const entry = { headline, writeup, picks: prunePicks(field, picks), words, filedAt: new Date().toISOString() };
if (flag("--dry-run")) console.log(`OK (dry run): ${season}, ${PICK_COUNT} picks, champion ${picks[5876] < 0 ? "First Four " + -picks[5876] : league[picks[5876]].name}, ${words} words`);
else { all[season] = { ...(all[season] || {}), hq: entry }; fs.writeFileSync(file, JSON.stringify(all)); console.log(`Filed ${season}: champion ${picks[5876] < 0 ? "First Four " + -picks[5876] : league[picks[5876]].name} (${words} words) -> data/challenge.json`); }
if (warnings.length) console.log("Warnings:\n- " + warnings.join("\n- "));
