// Graph toolkit for the schedule generator (pure functions, no DOM).
//  - circleRounds:      round-robin rounds by the circle method (provably optimal)
//  - edgeColor:         Misra-Gries edge colouring of a simple graph with at most maxDegree+1 colours
//  - eulerOrient:       orient every edge so each vertex has |out - in| <= 1
//  - shuffle / pick helpers around a seeded rng

export function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Circle method. Returns rounds; each round is a list of [x, y] pairs (indexes into `items`).
// Even n: n-1 rounds. Odd n: n rounds, one bye per round (the bye team is simply absent from that round).
export function circleRounds(n) {
  const m = n % 2 === 0 ? n : n + 1; // add a dummy for odd n
  const ids = Array.from({ length: m }, (_, i) => i);
  const rounds = [];
  for (let r = 0; r < m - 1; r++) {
    const round = [];
    for (let i = 0; i < m / 2; i++) {
      const a = ids[i], b = ids[m - 1 - i];
      if (a < n && b < n) round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    ids.splice(1, 0, ids.pop()); // rotate all but the first
  }
  return rounds;
}

// Misra-Gries: edges = [[u, v], ...] over vertices 0..n-1 (simple graph).
// (Colours are not guaranteed stable while the algorithm runs, so fixed colours are not supported: map colour classes afterwards.)
// Returns colours[] (one per edge, 0-based). Throws if more than `limit` colours would be needed.
export function edgeColor(n, edges, { limit = Infinity, rand = Math.random } = {}) {
  const deg = new Array(n).fill(0);
  for (const [u, v] of edges) { deg[u]++; deg[v]++; }
  const D = Math.max(0, ...deg), K = D + 1; // colours 0..D
  if (K > limit) throw new Error(`graph needs ${K} colours but only ${limit} allowed`);
  const col = new Map();          // "min,max" -> colour
  const nb = Array.from({ length: n }, () => new Map()); // nb[u]: colour -> neighbour via that colour
  const key = (u, v) => (u < v ? u * n + v : v * n + u);
  const colorOf = (u, v) => col.get(key(u, v));
  const setColor = (u, v, c) => { col.set(key(u, v), c); nb[u].set(c, v); nb[v].set(c, u); };
  const clearColor = (u, v) => { const c = col.get(key(u, v)); col.delete(key(u, v)); if (nb[u].get(c) === v) nb[u].delete(c); if (nb[v].get(c) === u) nb[v].delete(c); return c; };
  const freeAt = (u) => { for (let c = 0; c < K; c++) if (!nb[u].has(c)) return c; return -1; };
  const isFree = (u, c) => !nb[u].has(c);
  const adj = Array.from({ length: n }, () => []);
  edges.forEach(([u, v], i) => { adj[u].push(v); adj[v].push(u); });
  const order = edges.map((_, i) => i);
  // random order spreads colour classes evenly
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

  for (const ei of order) {
    const [u, v] = edges[ei];
    // 1. maximal fan of u starting at v
    const fan = [v], inFan = new Set([v]);
    for (;;) {
      const last = fan[fan.length - 1];
      let nextV = -1;
      for (const x of adj[u]) {
        if (inFan.has(x)) continue;
        const c = colorOf(u, x);
        if (c !== undefined && isFree(last, c)) { nextV = x; break; }
      }
      if (nextV < 0) break;
      fan.push(nextV); inFan.add(nextV);
    }
    const c = freeAt(u), d = freeAt(fan[fan.length - 1]);
    // 2. invert the c/d path starting at u (edges coloured d, c, d, ...)
    if (c !== d && !isFree(u, d)) {
      const path = [u]; let cur = u, want = d;
      for (;;) { const x = nb[cur].get(want); if (x === undefined) break; path.push(x); cur = x; want = want === d ? c : d; }
      const cols = [];
      for (let i = 0; i + 1 < path.length; i++) cols.push(colorOf(path[i], path[i + 1]));
      for (let i = 0; i + 1 < path.length; i++) clearColor(path[i], path[i + 1]);
      for (let i = 0; i + 1 < path.length; i++) setColor(path[i], path[i + 1], cols[i] === c ? d : c);
    }
    // 3. smallest prefix of the fan whose last vertex has d free
    let w = -1;
    for (let i = 0; i < fan.length; i++) {
      if (i > 0) { const cc = colorOf(u, fan[i]); if (cc === undefined || !isFree(fan[i - 1], cc)) break; } // prefix must still be a fan
      if (isFree(fan[i], d)) { w = i; break; }
    }
    if (w < 0) throw new Error("edgeColor: no valid fan pivot (should not happen)");
    // 4. rotate the fan prefix and colour (u, fan[w]) with d
    for (let i = 0; i < w; i++) {
      const cNext = colorOf(u, fan[i + 1]);
      clearColor(u, fan[i + 1]);
      setColor(u, fan[i], cNext);
    }
    setColor(u, fan[w], d);
  }
  const out = edges.map(([u, v]) => colorOf(u, v));
  if (out.some((x) => x === undefined)) throw new Error("edgeColor: some edges left uncoloured");
  if (Math.max(-1, ...out) + 1 > limit) throw new Error(`edgeColor used ${Math.max(...out) + 1} colours, limit ${limit}`);
  return out;
}

// Orient every edge so that each vertex has |out - in| <= 1 (exactly 0 when every degree is even).
// edges = [[u, v], ...] simple or multi graph. Returns an array of booleans: true = keep (u -> v), false = reversed (v -> u).
export function eulerOrient(n, edges) {
  const N = n + 1; // vertex n is a dummy joined to every odd-degree vertex
  const deg = new Array(n).fill(0);
  for (const [u, v] of edges) { deg[u]++; deg[v]++; }
  const all = edges.map(([u, v]) => [u, v]);
  for (let i = 0; i < n; i++) if (deg[i] % 2) all.push([i, n]);
  const adj = Array.from({ length: N }, () => []);
  all.forEach(([u, v], i) => { adj[u].push([v, i]); adj[v].push([u, i]); });
  const used = new Array(all.length).fill(false), dirForward = new Array(all.length).fill(true), ptr = new Array(N).fill(0);
  for (let s = 0; s < N; s++) {
    // walk trails until the component is exhausted (Hierholzer without splicing: any decomposition into closed/open trails balances in/out)
    while (ptr[s] < adj[s].length) {
      let cur = s;
      for (;;) {
        while (ptr[cur] < adj[cur].length && used[adj[cur][ptr[cur]][1]]) ptr[cur]++;
        if (ptr[cur] >= adj[cur].length) break;
        const [nxt, ei] = adj[cur][ptr[cur]++];
        used[ei] = true;
        dirForward[ei] = all[ei][0] === cur; // travelled cur -> nxt
        cur = nxt;
      }
    }
  }
  return dirForward.slice(0, edges.length);
}

// Even out colour-class sizes without breaking properness: move an edge to a smaller class whenever both endpoints are free
// in that class. Colours 0..K-1 (K may exceed the number of colours edgeColor used). Returns a new colours array.
export function balanceColors(n, edges, colors, K, rand = Math.random) {
  const out = colors.slice(), size = new Array(K).fill(0);
  const used = Array.from({ length: n }, () => new Uint8Array(K));
  edges.forEach(([u, v], i) => { size[out[i]]++; used[u][out[i]] = 1; used[v][out[i]] = 1; });
  const idx = edges.map((_, i) => i);
  for (let pass = 0; pass < 60; pass++) {
    let moved = 0;
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (const i of idx) {
      const [u, v] = edges[i], c = out[i];
      let best = -1;
      for (let d = 0; d < K; d++) if (d !== c && !used[u][d] && !used[v][d] && size[d] + 1 < size[c] && (best < 0 || size[d] < size[best])) best = d;
      if (best >= 0) { used[u][c] = 0; used[v][c] = 0; used[u][best] = 1; used[v][best] = 1; size[c]--; size[best]++; out[i] = best; moved++; }
    }
    if (!moved) break;
  }
  return out;
}
