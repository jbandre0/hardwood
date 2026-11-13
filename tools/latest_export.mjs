#!/usr/bin/env node
// Find the newest season export (hardwood-<season>-through-day-<N>.json) the commissioner downloaded.
//   node tools/latest_export.mjs            -> prints the path of the newest one (or exits 1 with advice)
// Looks in ./exports, ~/Downloads, ~/Desktop and the current folder, and prints what it found.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dirs = [path.join(ROOT, "exports"), path.join(os.homedir(), "Downloads"), path.join(os.homedir(), "Desktop"), process.cwd()];
const found = [];
for (const d of new Set(dirs)) {
  let names = []; try { names = fs.readdirSync(d); } catch { continue; }
  for (const n of names) {
    const m = /^hardwood-(season-\d+)-through-day-(\d+)(?: \(\d+\))?\.json$/.exec(n);
    if (m) { const p = path.join(d, n), st = fs.statSync(p); found.push({ p, season: m[1], day: +m[2], mtime: st.mtimeMs, mb: (st.size / 1e6).toFixed(1) }); }
  }
}
if (!found.length) {
  console.error("No hardwood-<season>-through-day-<N>.json export found in ./exports, Downloads or Desktop.\nOn the site: Commissioner desk (or Bracketology page) > Export for bracketology. Then run this again.");
  process.exit(1);
}
found.sort((a, b) => b.mtime - a.mtime);
for (const f of found.slice(0, 5)) console.error(`${f === found[0] ? "newest" : "      "}  ${f.season} through day ${f.day}  ${f.mb} MB  ${new Date(f.mtime).toLocaleString()}  ${f.p}`);
console.log(found[0].p);
