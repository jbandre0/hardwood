import { shell, fail } from "../ui.js";
import { loadCore, esc, teamLink, signed } from "../data.js";

(async function main() {
  const view = shell("standings");
  try {
    const core = await loadCore();
    const qs = new URLSearchParams(location.search);
    let conf = core.confs.includes(qs.get("c")) ? qs.get("c") : (core.confs.includes("ACC") ? "ACC" : core.confs[0]);

    view.innerHTML = `
      <div class="page-title fade-in"><span class="eyebrow">Season 1 final</span><h1>Standings</h1>
        <p>Teams sort by conference win percentage, then overall win percentage, then scoring margin. Conference tournament results sit underneath.</p></div>
      <div class="card fade-in" style="margin-bottom:18px"><div class="field" style="max-width:320px"><label for="conf">Conference</label>
        <select id="conf">${core.confs.map((c) => `<option${c === conf ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></div></div>
      <div id="out"></div>`;
    const out = document.getElementById("out");

    function draw() {
      history.replaceState(null, "", `?c=${encodeURIComponent(conf)}`);
      const rows = core.teams.filter((t) => t.conf === conf).sort((a, b) =>
        (b.cw / Math.max(1, b.cw + b.cl)) - (a.cw / Math.max(1, a.cw + a.cl)) || (b.w / (b.w + b.l)) - (a.w / (a.w + a.l)) || b.margin - a.margin);
      const ct = core.games.filter((g) => g.type === "CT" && g.ctx === conf);
      const days = [...new Set(ct.map((g) => g.day))].sort((a, b) => a - b);
      const labels = ["Opening round", "Round 2", "Quarterfinals", "Semifinals", "Championship"];
      const champG = ct.length ? ct[ct.length - 1] : null;
      const champ = champG ? core.teams[champG.w] : null;

      out.innerHTML = `
        <div class="card fade-in" style="margin-bottom:18px">
          <div class="card-head"><h2>${esc(conf)}</h2><span class="muted">${rows.length} teams</span></div>
          <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th class="r">Conf</th><th class="r">Pct</th><th class="r">Overall</th><th class="r">Home</th><th class="r">Away</th><th class="r">Neutral</th><th class="r">L10</th><th class="r">Strk</th><th class="r">PF</th><th class="r">PA</th><th class="r">Margin</th><th class="r">Rating</th></tr></thead><tbody>
            ${rows.map((t, i) => `<tr><td class="rank c">${i + 1}</td><td>${teamLink(t)}</td><td class="r num"><b>${t.cw}-${t.cl}</b></td><td class="r num">${(t.cw / Math.max(1, t.cw + t.cl)).toFixed(3).replace(/^0/, "")}</td><td class="r num">${t.w}-${t.l}</td><td class="r num muted">${esc(t.home)}</td><td class="r num muted">${esc(t.away)}</td><td class="r num muted">${esc(t.neutral)}</td><td class="r num muted">${esc(t.last10)}</td><td class="r num ${String(t.streak).startsWith("W") ? "up" : "down"}">${esc(t.streak)}</td><td class="r num muted">${t.pf.toFixed(1)}</td><td class="r num muted">${t.pa.toFixed(1)}</td><td class="r num ${t.margin >= 0 ? "up" : "down"}">${signed(t.margin)}</td><td class="r num"><b>${t.rating.toFixed(1)}</b></td></tr>`).join("")}
          </tbody></table></div>
        </div>
        ${ct.length ? `<div class="card fade-in">
          <div class="card-head"><h2>Conference tournament</h2>${champ ? `<span class="pill mint">Champion: ${esc(champ.name)}</span>` : ""}</div>
          <div class="grid cols-2">${days.map((d, i) => {
            const gs = ct.filter((g) => g.day === d);
            return `<div><h3 style="margin-bottom:8px;color:var(--accent)">${labels[Math.max(0, labels.length - days.length + i)]} <span class="faint" style="font-weight:600">Day ${d}</span></h3>
              ${gs.map((g) => `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:.92rem">
                <span><a href="team.html?t=${core.teams[g.w].slug}"><b>${esc(core.teams[g.w].name)}</b></a> <span class="faint">def.</span> <a href="team.html?t=${core.teams[g.l].slug}" class="muted">${esc(core.teams[g.l].name)}</a></span>
                <span class="num muted">${Math.max(g.ptsA, g.ptsB)}-${Math.min(g.ptsA, g.ptsB)}</span></div>`).join("")}</div>`;
          }).join("")}</div></div>` : ""}`;
    }
    document.getElementById("conf").onchange = (e) => { conf = e.target.value; draw(); };
    draw();
  } catch (e) { fail(view, e); }
})();
