// Test data for layout QA: teams that are NOT in the real field or bubble, with a made-up structure and placeholder text.
import fs from "node:fs";
const S = process.argv[2];
const real = JSON.parse(fs.readFileSync(S + "/out/field.json")), realOuts = JSON.parse(fs.readFileSync(S + "/out/outs.json"));
const used = new Set([...real, ...realOuts].map((t) => t.id));
const L = JSON.parse(fs.readFileSync("/home/user/hardwood/data/league.json")), LOGOS = JSON.parse(fs.readFileSync("/home/user/hardwood/data/logos.json"));
const pool = L.filter((t) => !used.has(t.id)).sort((a, b) => b.name.length - a.name.length);   // longest names first (stress test)
const take = [...pool.slice(0, 20), ...pool.slice(20).filter((_, i) => i % 4 === 0)].slice(0, 76);
const lorem = "A made up placeholder sentence about a hypothetical season with enough words to fill the card nicely. Best win: a road win at No. 12-rated Placeholder, 77-70. Outscored opponents by 11.2 points a game and went nine and one in the last ten.".split(" ");
const text = (n) => { const w = []; for (let i = 0; i < n; i++) w.push(lorem[i % lorem.length]); return w.join(" ") + "."; };
const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15], R = ["East", "South", "West", "Midwest"], out = [];
let k = 0; const lens = [18, 24, 30, 36, 27, 33, 21];
R.forEach((r, ri) => SEED_ORDER.forEach((sd, si) => {
  const ff = (sd === 11 && ri < 2) ? ri + 1 : (sd === 16 && ri >= 2) ? ri + 1 : null, n = ff ? 2 : 1;
  for (let j = 0; j < n; j++) { const t = take[k++], auto = ff ? ff > 2 : (k % 3 === 0); out.push({ id: t.id, name: t.name, slug: t.slug, logo: "assets/logos/" + LOGOS[t.slug].f, seed: sd, region: r, slotIndex: si, bid: auto ? "Auto" : "At-large", ff, ffPos: ff ? j : null, rec: `${20 + (k % 12)}-${3 + (k % 9)}`, conf: ["Big 12", "Mountain West", "Sun Belt", "A-10", "Ohio Valley", "Southland"][k % 6], blurb: text(lens[k % lens.length]), confRec: "12-8" }); }
}));
const outs = take.slice(k, k + 8).map((t, i) => ({ id: t.id, name: t.name, slug: t.slug, logo: "assets/logos/" + LOGOS[t.slug].f, rank: i + 1, group: i < 4 ? "FIRST FOUR OUT" : "NEXT FOUR OUT", rec: `${19 + i}-${12 + (i % 3)}`, conf: "A-10", blurb: text([20, 26, 31, 22, 28, 34, 24, 30][i]) }));
fs.writeFileSync(S + "/web/test/field.json", JSON.stringify(out)); fs.writeFileSync(S + "/web/test/outs.json", JSON.stringify(outs));
console.log("test field", out.length, "teams, outs", outs.length, "| longest test name length", Math.max(...out.map((t) => t.name.length)));
