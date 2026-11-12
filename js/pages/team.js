import { shell, fail } from "../ui.js";
import { loadCore, esc, badge, teamLink, signed, scheduleFor, roundOf } from "../data.js";

(async function main() {
  const view = shell("");
  try {
    const core = await loadCore();
    const slug = new URLSearchParams(location.search).get("t");
    const t = core.bySlug.get(slug);
    if (!t) { view.innerHTML = `<div class="card empty"><h3>Team not found</h3><p>Try the search box above, or browse the <a href="rankings.html" style="color:var(--accent)">rankings</a>.</p></div>`; return; }
    document.title = `${t.name} · Hardwood Sim`;
    const sch = scheduleFor(core, t.id);
    const post = core.seed.get(t.id);
    const ncaaGames = sch.filter((s) => s.g.type === "NCAA");
    let finish = "";
    if (post) {
      const last = ncaaGames[ncaaGames.length - 1];
      finish = last ? (last.won && last.g.day === 54 ? "National champion" : last.won ? "Advanced" : `Lost in the ${roundOf(last.g)}`) : "";
      if (last && last.g.day === 54 && !last.won) finish = "National runner-up";
    }
    const form = sch.slice(-10).map((s) => `<span class="res ${s.won ? "W" : "L"}" title="Day ${s.g.day}: ${s.won ? "W" : "L"} ${s.us}-${s.them} ${s.venue} ${esc(core.teams[s.opp].name)}">${s.won ? "W" : "L"}</span>`).join("");
    const e = t.eng; // engine profile
    const meters = [["Points / game", e[3], 60, 100, ""], ["2P%", e[14], 40, 62, "%"], ["3P%", e[9], 25, 45, "%"], ["FT%", e[8], 60, 85, "%"], ["Turnovers / game", e[7], 8, 16, ""], ["Steals / game", e[5], 4, 10, ""]];

    view.innerHTML = `
      <div class="team-hero fade-in">
        ${badge(t, 92)}
        <div><span class="eyebrow">${esc(t.conf)} &middot; Tier ${esc(t.tier)}</span><h1>${esc(t.name)}</h1>
          <p class="muted" style="margin:10px 0 0">${t.w}-${t.l} overall &middot; ${t.cw}-${t.cl} in conference &middot; ranked #${t.rank} in the power ratings${post ? ` &middot; ${post.seed}-seed in the NCAA Tournament${finish ? ` (${esc(finish)})` : ""}` : ""}</p></div>
        <div class="rating-big"><b>${t.rating.toFixed(1)}</b><small>Rating</small></div>
      </div>
      <div class="btn-row fade-in" style="margin-bottom:18px"><a class="btn" href="matchup.html?a=${t.slug}">Sim a matchup</a><a class="btn ghost" href="standings.html?c=${encodeURIComponent(t.conf)}">${esc(t.conf)} standings</a></div>
      <div class="grid cols-main">
        <div class="stack">
          <div class="card fade-in"><div class="kpis">
            <div class="kpi"><small>Margin / game</small><b class="${t.margin >= 0 ? "up" : "down"}">${signed(t.margin)}</b></div>
            <div class="kpi"><small>Strength of schedule</small><b>${t.oppRating.toFixed(1)}</b></div>
            <div class="kpi"><small>Points for</small><b>${t.pf.toFixed(1)}</b></div>
            <div class="kpi"><small>Points against</small><b>${t.pa.toFixed(1)}</b></div></div>
            <div class="grid cols-3" style="margin-top:12px;gap:12px">
              <div class="kpi"><small>Home</small><b>${esc(t.home)}</b></div><div class="kpi"><small>Away</small><b>${esc(t.away)}</b></div><div class="kpi"><small>Neutral</small><b>${esc(t.neutral)}</b></div></div></div>
          <div class="card fade-in">
            <div class="card-head"><h2>Season results</h2><span class="muted">${sch.length} games</span></div>
            <div class="table-wrap"><table><thead><tr><th>Day</th><th>Type</th><th></th><th>Opponent</th><th class="c">Result</th><th class="r">Score</th></tr></thead><tbody>
              ${sch.map((s) => { const o = core.teams[s.opp]; const sd = core.seed.get(s.opp); return `<tr><td class="muted num">${s.g.day}</td><td class="muted">${esc(roundOf(s.g))}</td><td class="faint">${s.venue}</td><td>${teamLink(o)} <span class="faint num" style="font-size:.8rem">#${o.rank}${sd && s.g.type === "NCAA" ? ` &middot; ${sd.seed}-seed` : ""}</span></td><td class="c"><span class="res ${s.won ? "W" : "L"}" style="display:inline-grid;place-items:center;width:26px;height:26px;border-radius:8px;font:800 .85rem var(--display)">${s.won ? "W" : "L"}</span></td><td class="r num">${s.us}-${s.them}</td></tr>`; }).join("")}
            </tbody></table></div>
          </div>
        </div>
        <div class="stack">
          <div class="card fade-in"><div class="card-head"><h2>Form</h2><span class="muted">Last 10: ${esc(t.last10)}</span></div><div class="form results">${form}</div>
            <p class="muted" style="margin:14px 0 0">Streak: <b style="color:var(--text)">${esc(t.streak)}</b></p></div>
          <div class="card fade-in"><div class="card-head"><h2>Resume</h2></div>
            <p style="margin:0 0 10px"><span class="faint">Best win</span><br><b>${esc(t.bestWin)}</b></p>
            <p style="margin:0"><span class="faint">Worst loss</span><br><b>${esc(t.worstLoss)}</b></p></div>
          <div class="card fade-in"><div class="card-head"><h2>Engine inputs</h2></div>
            ${meters.map(([l, v, lo, hi, u]) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:.88rem"><span class="muted">${l}</span><b class="num">${v.toFixed(1)}${u}</b></div><div class="prob-track" style="height:7px;margin-top:5px"><i style="width:${Math.max(3, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%"></i></div></div>`).join("")}
            <p class="faint" style="margin:6px 0 0;font-size:.8rem">These are the values the engine reads, on its own internal scale, so they run higher than box-score shooting. Compare teams to each other, not to real life.</p></div>
        </div>
      </div>`;
  } catch (err) { fail(view, err); }
})();
