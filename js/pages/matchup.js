import { shell, fail } from "../ui.js";
import { loadCore, esc, pct, signed, badge, byRank, teamHref } from "../data.js";
import { playGame } from "../engine.js";

const VENUES = [["neutral", "Neutral court"], ["A_home", "Team A at home"], ["B_home", "Team B at home"]];

// play-by-play wording for each outcome code (o = offense, d = defense)
const SAY = {
  1: (o) => `${o} gets to the line and splits the free throws`, 2: (o) => `${o} hits both free throws`,
  3: (o) => `${o} misses both free throws`, 4: (o) => `${o} turns it over`, 5: (o) => `${o} loses the ball out of bounds`,
  6: (o, d) => `${d} picks ${o}'s pocket`, 7: (o) => `${o} buries a three`, 8: (o, d) => `${o} misses a three, ${d} rebounds`,
  9: (o) => `${o} scores inside`, 10: (o, d) => `${o} misses a two, ${d} rebounds`,
  11: (o) => `${o} misses a three, grabs the board, and drains another three`,
  12: (o) => `${o} misses a two, rebounds, and hits a three`,
  13: (o, d) => `${o} misses a three, gets the board, misses again; ${d} rebounds`,
  14: (o, d) => `${o} misses a two, gets the board, misses a three; ${d} rebounds`,
  15: (o) => `${o} misses a three, gets the board, and scores inside`,
  16: (o) => `${o} misses a two, gets the board, and puts it back`,
  17: (o, d) => `${o} misses a three, gets the board, misses a two; ${d} rebounds`,
  18: (o, d) => `${o} misses, gets the board, misses again; ${d} rebounds`,
  19: (o) => `Goaltending, ${o} gets the bucket`,
  20: (o) => `${o} misses a free throw, rebounds, and scores`, 21: (o, d) => `${o} misses a free throw, rebounds, misses again; ${d} rebounds`,
  22: (o) => `${o} misses a free throw, rebounds, and hits a three`, 23: (o, d) => `${o} misses a free throw, rebounds, misses a three; ${d} rebounds`,
  24: (o) => `${o} misses the front end of a one-and-one`,
  25: (o) => `${o} runs a set play out of bounds: three!`, 26: (o) => `${o} runs a set play out of bounds: the three misses`,
  27: (o) => `${o} runs a set play out of bounds and scores`, 28: (o) => `${o} runs a set play out of bounds: no good`,
  29: (o) => `Shot clock violation on ${o}`,
};

const fmtClock = (p) => {
  const half = p.ot ? 300 : (p.t > 1200 ? p.t - 1200 : p.t);
  const m = Math.floor(half / 60), s = Math.floor(half % 60);
  const label = p.ot ? `OT${p.ot}` : p.t > 1200 ? "H1" : "H2";
  return `${label} ${m}:${String(s).padStart(2, "0")}`;
};

function histogram(h, nameA, nameB) {
  const HB = 60, max = Math.max(...h), W = 600, H = 150, bw = W / h.length;
  const bars = h.map((v, i) => {
    const m = i - HB, ht = (v / max) * (H - 18);
    const fill = m > 0 ? "var(--accent)" : m < 0 ? "var(--peach)" : "var(--faint)";
    return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(H - ht - 14).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${ht.toFixed(1)}" rx="1.5" fill="${fill}" opacity=".9"/>`;
  }).join("");
  const mid = HB * bw + bw / 2;
  return `<svg class="hist" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Distribution of final margins (Team A minus Team B) across 40,000 simulated games">
    ${bars}<line x1="${mid}" x2="${mid}" y1="4" y2="${H - 14}" stroke="var(--text)" stroke-opacity=".35" stroke-dasharray="3 3"/>
    ${[-40, -20, 0, 20, 40].map((v) => `<text x="${((v + HB) * bw + bw / 2).toFixed(1)}" y="${H - 1}" fill="var(--faint)" font-size="11" text-anchor="middle">${v > 0 ? "+" + v : v}</text>`).join("")}
    </svg>`;
}

(async function main() {
  const view = shell("matchup");
  try {
    const core = await loadCore();
    const ranked = byRank(core);
    const qs = new URLSearchParams(location.search);
    const pick = (slug, fallback) => core.bySlug.get(slug) || fallback;
    let A = pick(qs.get("a"), ranked[0]);
    let B = pick(qs.get("b"), ranked[1]);
    let venue = VENUES.some((v) => v[0] === qs.get("v")) ? qs.get("v") : "neutral";

    const opts = (sel) => ranked.map((t) => `<option value="${t.slug}"${t === sel ? " selected" : ""}>#${t.rank} ${esc(t.name)} (${esc(t.conf)})</option>`).join("");
    view.innerHTML = `
      <div class="page-title"><span class="kicker">Matchup simulator</span><h1>Tip it off</h1>
        <p>Pick any two of the 365 teams and a venue. The engine plays 40,000 games, one possession at a time, and tells you who wins and by how much.</p></div>
      <div class="card" style="margin-bottom:18px">
        <div class="versus">
          <div class="field"><label for="selA">Team A</label><select id="selA">${opts(A)}</select></div>
          <div class="vs">VS</div>
          <div class="field"><label for="selB">Team B</label><select id="selB">${opts(B)}</select></div>
        </div>
        <div class="btn-row" style="margin-top:16px;align-items:end">
          <div class="field" style="min-width:210px"><label for="selV">Venue</label>
            <select id="selV">${VENUES.map(([v, l]) => `<option value="${v}"${v === venue ? " selected" : ""}>${l}</option>`).join("")}</select></div>
          <button class="btn ghost" id="swap" type="button">Swap teams</button>
          <button class="btn ghost" id="rand" type="button">Random matchup</button>
        </div>
      </div>
      <div id="out"></div>`;

    const out = document.getElementById("out");
    const selA = document.getElementById("selA"), selB = document.getElementById("selB"), selV = document.getElementById("selV");

    // ---- worker with stale-result protection ----
    let worker, runId = 0;
    try { worker = new Worker("js/sim-worker.js", { type: "module" }); } catch { worker = null; }
    const results = new Map();
    if (worker) worker.onmessage = (e) => { const r = results.get(e.data.id); if (r) { results.delete(e.data.id); e.data.error ? r.rej(new Error(e.data.error)) : r.res(e.data.res); } };
    async function simulate() {
      const id = ++runId, seed = 20261 + id;
      if (worker) return new Promise((res, rej) => { results.set(id, { res, rej }); worker.postMessage({ id, rowA: A.eng, rowB: B.eng, venue, n: 40000, seed }); });
      const { predict } = await import("../engine.js");
      return predict(A.eng, B.eng, venue, { n: 40000, seed });
    }

    async function run() {
      const myRun = runId + 1;
      history.replaceState(null, "", `?a=${A.slug}&b=${B.slug}&v=${venue}`);
      if (A === B) { runId++; out.innerHTML = `<div class="card empty">Pick two different teams. A team can't beat itself (though some of them try).</div>`; return; }
      out.innerHTML = `<div class="card"><div class="skeleton" style="min-height:260px"></div><p class="status" style="margin:10px 0 0">Simulating 40,000 games…</p></div>`;
      let r;
      try { r = await simulate(); } catch (e) { out.innerHTML = `<div class="card empty">Simulation failed: ${esc(e.message)}</div>`; return; }
      if (myRun !== runId) return; // a newer run superseded this one
      const pA = r.p, pB = 1 - r.p;
      const fav = pA >= pB ? A : B, fp = Math.max(pA, pB);
      const spread = r.margin;
      const venueNote = venue === "neutral" ? "Neutral court" : `${(venue === "A_home" ? A : B).name} at home`;
      out.innerHTML = `
        <div class="card" style="margin-bottom:18px">
          <div class="matchup-head">
            <div class="mh-team">${badge(A, 62)}<div><h2>${esc(A.name)}</h2><small>${esc(A.conf)} &middot; Tier ${esc(A.tier)} &middot; ${A.w}-${A.l}</small></div></div>
            <span class="pill">${esc(venueNote)}</span>
            <div class="mh-team right">${badge(B, 62)}<div><h2>${esc(B.name)}</h2><small>${esc(B.conf)} &middot; Tier ${esc(B.tier)} &middot; ${B.w}-${B.l}</small></div></div>
          </div>
          <div class="prob-row">
            <div class="prob-pct">${pct(pA)}</div>
            <div class="prob-track" role="img" aria-label="${esc(A.name)} ${pct(pA)}, ${esc(B.name)} ${pct(pB)}"><i style="width:${(pA * 100).toFixed(1)}%"></i><i style="width:${(pB * 100).toFixed(1)}%"></i></div>
            <div class="prob-pct" style="color:var(--warm)">${pct(pB)}</div>
          </div>
          <p class="muted" style="margin:14px 0 0"><b style="color:var(--text)">${esc(fav.name)}</b> wins ${pct(fp)} of the time, by an average of ${Math.abs(spread).toFixed(1)}.</p>
        </div>
        <div class="grid cols-main">
          <div class="stack">
            <div class="card"><div class="kpis">
              <div class="kpi"><small>Projected score</small><b>${r.scoreA.toFixed(0)}-${r.scoreB.toFixed(0)}</b></div>
              <div class="kpi"><small>Spread</small><b>${Math.abs(spread).toFixed(1)}</b><span>${esc(spread >= 0 ? A.name : B.name)}</span></div>
              <div class="kpi"><small>Total points</small><b>${r.total.toFixed(1)}</b></div>
              <div class="kpi"><small>Margin SD</small><b>${r.sd.toFixed(1)}</b></div></div></div>
            <div class="card"><div class="card-head"><h3>Margin distribution</h3><span class="faint">${r.n.toLocaleString()} games</span></div>
              ${histogram(r.hist, A.name, B.name)}</div>
          </div>
          <div class="card" id="play">
            <div class="card-head"><h3>Play one game</h3></div>
            <p class="muted">Run a single game from this matchup and read it back possession by possession.</p>
            <div class="btn-row"><button class="btn" id="playBtn" type="button">Tip off</button></div>
            <div id="game" style="margin-top:16px"></div>
          </div>
        </div>`;
      document.getElementById("playBtn").onclick = playOne;
    }

    function playOne() {
      const g = playGame(A.eng, B.eng, venue);
      const win = g.scoreA > g.scoreB ? A : B;
      const nm = (side) => (side === "A" ? A.name : B.name);
      let showAll = false;
      const gameEl = document.getElementById("game");
      const draw = () => {
        const rows = g.log.filter((p) => showAll || p.pts > 0).map((p) => {
          const o = nm(p.side), d = nm(p.side === "A" ? "B" : "A");
          return `<div class="${p.pts ? "sc" : ""}"><span class="clk">${fmtClock(p)}</span><span>${esc(SAY[p.code](o, d))}</span><span class="pts">${p.pts ? "+" + p.pts + " " : ""}${p.a}-${p.b}</span></div>`;
        }).join("");
        gameEl.querySelector(".pbp").innerHTML = rows;
      };
      gameEl.innerHTML = `
        <div class="scoreboard">
          <div><div class="sb-team">${esc(A.name)}</div><div class="sb-pts" ${g.scoreA < g.scoreB ? 'style="color:var(--faint)"' : ""}>${g.scoreA}</div></div>
          <div class="sb-mid">FINAL${g.ot ? ` / ${g.ot > 1 ? g.ot : ""}OT` : ""}</div>
          <div><div class="sb-team">${esc(B.name)}</div><div class="sb-pts" ${g.scoreB < g.scoreA ? 'style="color:var(--faint)"' : ""}>${g.scoreB}</div></div>
        </div>
        <p class="muted" style="margin:0 0 10px"><b style="color:var(--text)">${esc(win.name)}</b> wins by ${Math.abs(g.scoreA - g.scoreB)}.</p>
        <div class="seg" style="margin-bottom:10px"><button type="button" class="on" data-m="sc">Scoring plays</button><button type="button" data-m="all">Every possession</button></div>
        <div class="pbp" tabindex="0" aria-label="Play by play"></div>`;
      gameEl.querySelectorAll(".seg button").forEach((b) => b.onclick = () => {
        showAll = b.dataset.m === "all";
        gameEl.querySelectorAll(".seg button").forEach((x) => x.classList.toggle("on", x === b));
        draw();
      });
      draw();
    }

    const update = (() => { let t; return () => { clearTimeout(t); t = setTimeout(run, 60); }; })();
    selA.onchange = () => { A = core.bySlug.get(selA.value); update(); };
    selB.onchange = () => { B = core.bySlug.get(selB.value); update(); };
    selV.onchange = () => { venue = selV.value; update(); };
    document.getElementById("swap").onclick = () => { [A, B] = [B, A]; selA.value = A.slug; selB.value = B.slug; if (venue !== "neutral") { venue = venue === "A_home" ? "B_home" : "A_home"; selV.value = venue; } update(); };
    document.getElementById("rand").onclick = () => {
      const r = () => core.teams[Math.floor(Math.random() * core.teams.length)];
      A = r(); do { B = r(); } while (B === A);
      selA.value = A.slug; selB.value = B.slug; update();
    };
    run();
  } catch (e) { fail(view, e); }
})();
