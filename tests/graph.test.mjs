import test from "node:test";
import assert from "node:assert/strict";
import { balanceColors, circleRounds, edgeColor, eulerOrient, shuffle } from "../js/league/graph.js";
import { makeRng } from "../js/engine.js";

function assertProper(n, edges, colors) {
  const seen = new Map();
  edges.forEach(([u, v], i) => { for (const x of [u, v]) { const k = x * 1000 + colors[i]; assert.ok(!seen.has(k), `vertex ${x} has two edges coloured ${colors[i]}`); seen.set(k, 1); } });
}

test("circleRounds: every pair exactly once, nobody twice in a round (n = 7, 8, 11, 12, 13, 18)", () => {
  for (const n of [2, 3, 7, 8, 11, 12, 13, 18]) {
    const R = circleRounds(n), pairs = new Set();
    assert.equal(R.length, n % 2 ? n : n - 1);
    for (const round of R) { const inRound = new Set(); for (const [a, b] of round) { assert.ok(!inRound.has(a) && !inRound.has(b)); inRound.add(a); inRound.add(b); const k = Math.min(a, b) * 100 + Math.max(a, b); assert.ok(!pairs.has(k)); pairs.add(k); } }
    assert.equal(pairs.size, n * (n - 1) / 2);
  }
});

test("edgeColor: proper colouring with at most maxDegree+1 colours on 300 random graphs", () => {
  const rand = makeRng(7);
  for (let t = 0; t < 300; t++) {
    const n = 5 + Math.floor(rand() * 40), p = 0.1 + rand() * 0.6, edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rand() < p) edges.push([i, j]);
    if (!edges.length) continue;
    const deg = new Array(n).fill(0); edges.forEach(([u, v]) => { deg[u]++; deg[v]++; });
    const colors = edgeColor(n, edges, { rand });
    assertProper(n, edges, colors);
    assert.ok(Math.max(...colors) + 1 <= Math.max(...deg) + 1, `used ${Math.max(...colors) + 1} > ${Math.max(...deg) + 1}`);
  }
});

test("edgeColor: the 8-regular circulant on 13 vertices fits in 9 colours (the tight conference case)", () => {
  const rand = makeRng(11);
  for (let t = 0; t < 40; t++) {
    const offs = shuffle([1, 2, 3, 4, 5, 6], rand).slice(0, 4), edges = [];
    for (let i = 0; i < 13; i++) for (const d of offs) { const j = (i + d) % 13; edges.push([Math.min(i, j), Math.max(i, j)]); }
    const uniq = [...new Map(edges.map((e) => [e.join(), e])).values()];
    assert.equal(uniq.length, 52);
    const colors = edgeColor(13, uniq, { rand, limit: 9 });
    assertProper(13, uniq, colors);
  }
});

test("eulerOrient: |out - in| <= 1 everywhere, and 0 where the degree is even", () => {
  const rand = makeRng(5);
  for (let t = 0; t < 200; t++) {
    const n = 4 + Math.floor(rand() * 30), edges = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rand() < 0.4) edges.push([i, j]);
    const dir = eulerOrient(n, edges), bal = new Array(n).fill(0), deg = new Array(n).fill(0);
    edges.forEach(([u, v], i) => { const [a, b] = dir[i] ? [u, v] : [v, u]; bal[a]++; bal[b]--; deg[u]++; deg[v]++; });
    for (let i = 0; i < n; i++) { assert.ok(Math.abs(bal[i]) <= 1); if (deg[i] % 2 === 0) assert.equal(bal[i], 0); }
  }
});

test("balanceColors keeps the colouring proper and evens out class sizes", () => {
  const rand = makeRng(21), n = 120, edges = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rand() < 0.12) edges.push([i, j]);
  const deg = new Array(n).fill(0); edges.forEach(([u, v]) => { deg[u]++; deg[v]++; });
  const K = Math.max(...deg) + 3, base = edgeColor(n, edges, { rand }), bal = balanceColors(n, edges, base, K, rand);
  assertProper(n, edges, bal);
  const sz = (c) => { const s = new Array(K).fill(0); c.forEach((x) => s[x]++); return Math.max(...s) - Math.min(...s); };
  assert.ok(sz(bal) < sz(base), `spread ${sz(base)} -> ${sz(bal)}`);
});
