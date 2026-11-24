// Builds plan.json: the clip timeline, in whole beats of the soundtrack (so every slam lands on a beat), plus sound-effect events.
// usage: node make_plan.mjs <dir containing field.json and outs.json> <season number, e.g. 4>
import fs from "node:fs";
import path from "node:path";
const dir = process.argv[2], season = process.argv[3];
if (!season) throw new Error("usage: node make_plan.mjs <dir> <season number>");
const field = JSON.parse(fs.readFileSync(path.join(dir, "field.json"), "utf8")), outs = JSON.parse(fs.readFileSync(path.join(dir, "outs.json"), "utf8"));
const PER = 0.3328, REGIONS = ["East", "South", "West", "Midwest"];
const bars = (n) => n * 4, ceil4 = (b) => Math.ceil(b / 4) * 4;
const clips = [];
const add = (c) => clips.push({ ...c, dur: +(c.beats * PER).toFixed(4) });
const words = (s) => s.split(/\s+/).filter(Boolean).length;

// intro: 12 bars. The music drops on bar 4 (beat 16): title slam; counter hits on beats 24, 28, 32
add({ kind: "intro", beats: bars(12), ev: [{ b: 6, k: "shimmer" }, { b: 14, k: "riser" }, { b: 17, k: "drop" }, { b: 25, k: "tick" }, { b: 29, k: "tick" }, { b: 33, k: "tick" }, { b: 41, k: "hit" }] });

field.forEach((t, i) => { t._i = i; });
for (const R of REGIONS) {
  add({ kind: "regionTitle", region: R, beats: bars(3), ev: [{ b: -1, k: "riser" }, { b: 1, k: "drop" }, { b: 5, k: "whoosh" }] });
  field.filter((t) => t.region === R).forEach((t) => {
    const readBeats = Math.max(10, Math.ceil(words(t.blurb) / 5.0 / PER) + 1);
    const F = 7 + readBeats, total = ceil4(F + 6);
    add({ kind: "team", i: t._i, beats: total, F, ev: [{ b: -2, k: "riser" }, { b: 1, k: "slam" }, { b: 3, k: "whoosh" }, { b: 5, k: "swish" }, { b: F, k: "whoosh2" }, { b: F + 3, k: "ting" }] });
  });
  add({ kind: "regionDone", region: R, beats: bars(5), ev: [{ b: 0, k: "swish" }, { b: 4, k: "ting" }, { b: 8, k: "ting" }, { b: 12, k: "hit" }] });
}
add({ kind: "finale", beats: bars(7), ev: [{ b: -1, k: "riser" }, { b: 1, k: "drop" }, { b: 9, k: "ting" }, { b: 13, k: "ting" }, { b: 17, k: "ting" }, { b: 21, k: "ting" }, { b: 25, k: "hit" }] });
add({ kind: "outsTitle", beats: bars(4), mood: "dark", ev: [{ b: -1, k: "riserlow" }, { b: 1, k: "lowhit" }, { b: 7, k: "whoosh" }] });
const order = [...outs].sort((a, b) => b.rank - a.rank);                     // 8 down to 1
order.forEach((o) => {
  const readBeats = Math.max(10, Math.ceil(words(o.blurb) / 5.0 / PER) + 1), last = o.rank === 1;
  const total = ceil4(7 + readBeats + (last ? 8 : 4));
  add({ kind: "out", rank: o.rank, beats: total, mood: "dark", ev: [{ b: -2, k: "riserlow" }, { b: 1, k: "lowhit" }, { b: 3, k: "whoosh" }, { b: 5, k: "swish" }, ...(last ? [{ b: total - 6, k: "lowhit" }] : [])] });
});
add({ kind: "outsBoard", beats: bars(5), mood: "dark", ev: [{ b: 0, k: "swish" }, { b: 6, k: "tick" }, { b: 10, k: "tick" }] });
add({ kind: "outro", beats: bars(8), ev: [{ b: 0, k: "swish" }, { b: 4, k: "shimmer" }, { b: 16, k: "hit" }] });

let t = 0; clips.forEach((c, i) => { c.n = i; c.start = +t.toFixed(4); t += c.dur; });
fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify({ season, PER, regions: REGIONS, total: +t.toFixed(3), clips }, null, 1));
const kinds = {}; clips.forEach((c) => { kinds[c.kind] = (kinds[c.kind] || 0) + 1; });
console.log("clips:", clips.length, JSON.stringify(kinds), "| total", (t / 60).toFixed(1), "min | longest team clip", Math.max(...clips.filter((c) => c.kind === "team").map((c) => c.dur)).toFixed(1) + "s");
