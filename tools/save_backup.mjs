#!/usr/bin/env node
// Save the full browser backup carried inside a bracketology export to data/backups/latest.json (deployed with the site,
// so the Commissioner desk can restore it on any device). Git history keeps every earlier week.
//   node tools/save_backup.mjs <season-export.json>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const X = JSON.parse(fs.readFileSync(process.argv[2], "utf8")), B = X.backup;
if (!B || B.app !== "hardwood-sim" || B.format !== 1 || typeof B.overlays !== "object") { console.error("This export has no backup inside (exported before backups were added?). Nothing saved."); process.exit(1); }
const counts = Object.fromEntries(Object.entries(B.overlays).filter(([k]) => !k.includes(":")).map(([k, o]) => [k, (o.order || []).length]));
const local = Object.keys(B.overlays).filter((k) => k.startsWith("base:")).map((k) => k.slice(5));
const out = { ...B, savedToRepoAt: new Date().toISOString(), from: { season: X.season.id, label: X.season.label, throughDay: X.throughDay, gamesPlayed: X.gamesPlayed }, counts, localSeasons: local };
fs.writeFileSync(path.join(ROOT, "data/backups/latest.json"), JSON.stringify(out));
console.log(`Backup saved: ${X.season.label} through day ${X.throughDay}; games recorded on the site per season ${JSON.stringify(counts)}; browser-made seasons ${JSON.stringify(local)}; ${(fs.statSync(path.join(ROOT, "data/backups/latest.json")).size / 1e6).toFixed(2)} MB`);
