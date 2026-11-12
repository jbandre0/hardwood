import { shell, fail } from "../ui.js";
import { combobox } from "../combobox.js";
import { loadCore, esc, teamLink, signed } from "../data.js";
import { confStandings, conferencePower } from "../league/standings.js";
import { nextUnplayed } from "../league/league.js";

(async function main() {
  const view = shell("standings");
  try {
    const core = await loadCore();
    const qs = new URLSearchParams(location.search);
    let conf = core.confs.includes(qs.get("c")) ? qs.get("c") : (core.confs.includes("ACC") ? "ACC" : core.confs[0]);
    const { season } = core, done = season.status === "complete";
    const nx = nextUnplayed(core.state), power = conferencePower(core.teams);
    const lastPoll = core.polls[core.polls.length - 1];
    const apRank = new Map(lastPoll ? lastPoll.ranks.map((id, i) => [id, i + 1]) : []);
    const regLeftToday = nx ? core.games.filter((g) => g.day === nx.day && !g.played).length : 0;
    const daysLeft = nx && nx.day <= 42 ? 42 - nx.day + 1 : 0;

    view.innerHTML = `
      <div class="page-title"><span class="kicker">${esc(season.label)} ${done ? "final" : "&middot; through day " + season.day}</span><h1>Standings</h1>
        <p>Teams sort by conference win percentage, then overall win percentage, then scoring margin. Conference tournament results sit underneath once they're played.</p></div>
      <div class="card" style="margin-bottom:18px">
        <div class="field" style="max-width:320px"><label for="conf">Conference</label><div id="cbConf"></div></div>
        ${done ? "" : `<p class="muted" style="margin:14px 0 0;font-size:.9rem">${season.played.toLocaleString()} of ${season.total.toLocaleString()} games played${nx ? ` &middot; next day ${nx.day} (${regLeftToday} games) &middot; ${daysLeft} regular-season days left` : ""}</p>`}
      </div>
      <div id="out"></div>
      <div class="card plain" style="margin-top:24px">
        <div class="card-head"><h2>Conference power</h2><span class="muted">how each conference does against everyone else</span></div>
        <div class="table-wrap"><table><thead><tr><th class="c">Rank</th><th>Conference</th><th class="r">Teams</th><th class="r">Non-conf W</th><th class="r">Non-conf L</th><th class="r">Non-conf %</th><th class="r">Avg rating</th><th class="r">Avg tier rating</th></tr></thead><tbody>
          ${[...power].sort((a, b) => a.rank - b.rank).map((r) => `<tr class="clickable" data-conf="${esc(r.conf)}"><td class="rank c">${r.rank}</td><td><b>${esc(r.conf)}</b></td><td class="r num">${r.teams}</td><td class="r num">${r.ncW}</td><td class="r num">${r.ncL}</td><td class="r num">${r.ncW + r.ncL ? r.ncPct.toFixed(3).replace(/^0/, "") : "—"}</td><td class="r num ${r.avgRating >= 0 ? "up" : "down"}">${signed(r.avgRating)}</td><td class="r num muted">${signed(r.avgTier)}</td></tr>`).join("")}
        </tbody></table></div>
      </div>`;
    const out = document.getElementById("out");

    function draw() {
      history.replaceState(null, "", `?c=${encodeURIComponent(conf)}`);
      const rows = confStandings(core.teams, conf);
      const ct = core.games.filter((g) => g.type === "CT" && g.ctx === conf && g.played);
      const days = [...new Set(ct.map((g) => g.day))].sort((a, b) => a - b);
      const labels = ["Opening round", "Round 2", "Quarterfinals", "Semifinals", "Championship"];
      const champG = ct.length && ct.some((g) => g.day === 47) ? ct[ct.length - 1] : null;
      const champ = champG ? core.teams[champG.w] : null;
      out.innerHTML = `
        <div class="card plain" style="margin-bottom:24px">
          <div class="card-head"><h2>${esc(conf)}</h2><span class="muted">${rows.length} teams</span></div>
          <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th class="c">AP</th><th class="c">Tier</th><th class="r">Conf</th><th class="r">Pct</th><th class="r">Overall</th><th class="r">Home</th><th class="r">Away</th><th class="r">Neutral</th><th class="r">L10</th><th class="r">Strk</th><th class="r">PF</th><th class="r">PA</th><th class="r">Margin</th><th class="r">Rating</th></tr></thead><tbody>
            ${rows.map((t, i) => `<tr><td class="rank c">${i + 1}</td><td>${teamLink(t)}</td><td class="c num muted">${apRank.has(t.id) ? "#" + apRank.get(t.id) : ""}</td><td class="c"><span class="pill">${esc(t.tier)}</span></td><td class="r num"><b>${t.cw}-${t.cl}</b></td><td class="r num">${(t.cw / Math.max(1, t.cw + t.cl)).toFixed(3).replace(/^0/, "")}</td><td class="r num">${t.w}-${t.l}</td><td class="r num muted">${esc(t.home)}</td><td class="r num muted">${esc(t.away)}</td><td class="r num muted">${esc(t.neutral)}</td><td class="r num muted">${esc(t.last10)}</td><td class="r num ${String(t.streak).startsWith("W") ? "up" : "down"}">${esc(t.streak)}</td><td class="r num muted">${t.pf.toFixed(1)}</td><td class="r num muted">${t.pa.toFixed(1)}</td><td class="r num ${t.margin >= 0 ? "up" : "down"}">${signed(t.margin)}</td><td class="r num"><b>${t.rating.toFixed(1)}</b></td></tr>`).join("")}
          </tbody></table></div>
        </div>
        ${ct.length ? `<div class="card">
          <div class="card-head"><h2>Conference tournament</h2>${champ ? `<span class="pill mint">Champion: ${esc(champ.name)}</span>` : ""}</div>
          <div class="grid cols-2">${days.map((d, i) => {
            const gs = ct.filter((g) => g.day === d);
            return `<div><h3 style="margin-bottom:8px;color:var(--accent)">${labels[Math.max(0, labels.length - days.length + i)]} <span class="faint" style="font-weight:600">Day ${d}</span></h3>
              ${gs.map((g) => `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:7px 0;border-bottom:1px solid var(--line);font-size:.92rem">
                <span><a href="team.html?t=${core.teams[g.w].slug}"><b>${esc(core.teams[g.w].name)}</b></a> <span class="faint">def.</span> <a href="team.html?t=${core.teams[g.l].slug}" class="muted">${esc(core.teams[g.l].name)}</a></span>
                <span class="num muted">${Math.max(g.ptsA, g.ptsB)}-${Math.min(g.ptsA, g.ptsB)}</span></div>`).join("")}</div>`;
          }).join("")}</div></div>` : ""}`;
    }
    const cb = combobox(document.getElementById("cbConf"), { id: "conf", value: conf, placeholder: "Conference", options: core.confs.map((c) => ({ value: c, label: c })), onChange: (v) => { conf = v; draw(); } });
    view.querySelectorAll("tr.clickable[data-conf]").forEach((tr) => tr.addEventListener("click", () => { conf = tr.dataset.conf; cb.set(conf); draw(); window.scrollTo({ top: 0, behavior: "smooth" }); }));
    draw();
  } catch (e) { fail(view, e); }
})();
