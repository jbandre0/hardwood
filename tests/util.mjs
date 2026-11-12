// Shared helpers for the node:test suites (run all with:  node --test tests/)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
export const league = () => readJSON("data/league.json");
export const season = (id, file) => readJSON(`data/seasons/${id}/${file}.json`);
export const fixture = (name) => readJSON(`tools/fixtures/${name}.json`);
export const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
