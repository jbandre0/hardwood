import { shell, fail } from "../ui.js";
import { loadCore, esc, badge, teamLink, signed, scheduleFor, roundOf } from "../data.js";
import { ENG } from "../league/stats.js";

const IX = Object.fromEntries(ENG.map((n, i) => [n, i]));

(async function main() {
  const view = shell("");
  try {
    const core = await loadCore();
    const slug = new URLSearchParams(location.search).get("t");
    const t = core.bySlug.get(slug);
    if (!t) { view.innerHTML = `<div class="card empty"><h3>Team not found</h3><p>Try the search box above, or browse the <a href="rankings.html" style="color:var(--accent)">rankings</a>.</p></div>`; return; }
    document.title = `${t.name} · Hardwood Sim`;
    const { season, teams } = core, S = core.data.settings.settings;
    const sch = scheduleFor(core, t.id), playedSch = sch.filter((s) => s.played);
    const lastPoll = core.polls[core.polls.length - 1];
    const apRank = new Map(lastPoll ? lastPoll.ranks.map((id, i) => [id, i + 1]) : []);
    const post = core.seed.get(t.id), ncaaGames = playedSch.filter((s) => s.g.type === "NCAA");
    let finish = "";
    if (post) {
      const last = ncaaGames[ncaaGames.length - 1];
      finish = last ? (last.won && last.g.day === 54 ? "National champion" : last.won ? "Advanced" : `Lost in the ${roundOf(last.g)}`) : "";
      if (last && last.g.day === 54 && !last.won) finish = "National runner-up";
    }
    const form = playedSch.slice(-10).map((s) => `<span class="res ${s.won ? "W" : "L"}" title="Day ${s.g.day}: ${s.won ? "W" : "L"} ${s.us}-${s.them} ${s.venue} ${esc(teams[s.opp].name)}">${s.won ? "W" : "L"}</span>`).join("");
    const next = sch.find((s) => !s.played);
    const w = (1 - S.anchor) * Math.min(1, t.gp / S.ramp);
    const ratedTeams = teams.filter((x) => x.gp > 0).length;
    const games0 = t.start[IX["Games"]];
    const perGame = (arr, name) => (["OR", "DR"].includes(name) ? arr[IX[name]] / games0 : arr[IX[name]]);
    const stats = [["PPG", "Points / game"], ["3P%", "3P%"], ["2P%", "2P%"], ["FT%", "FT%"], ["TO", "Turnovers"], ["ST", "Steals"], ["OR", "Off. rebounds"], ["DR", "Def. rebounds"]];
    const live = t.eng.slice(2); // [Games, PPG, ...]
    let rw = 0, rl = 0;

    view.innerHTML = `
      <div class="team-hero">
        ${badge(t, 92)}
        <div><span class="kicker">${esc(t.conf)} &middot; Tier ${esc(t.tier)} &middot; ${esc(season.label)}</span><h1>${esc(t.name)}</h1>
          <p class="muted" style="margin:10px 0 0">${t.w}-${t.l} overall &middot; ${t.cw}-${t.cl} in conference${t.gp ? ` &middot; ranked #${t.rank} in the power ratings` : ""}${post ? ` &middot; ${post.seed}-seed in the NCAA Tournament${finish ? ` (${esc(finish)})` : ""}` : ""}</p></div>
        <div class="rating-big"><b>${t.gp ? t.rating.toFixed(1) : "—"}</b><small>Rating</small></div>
      </div>
      <div class="btn-row" style="margin-bottom:18px"><a class="btn" href="matchup.html?a=${t.slug}">Sim a matchup</a><a class="btn ghost" href="standings.html?c=${encodeURIComponent(t.conf)}">${esc(t.conf)} standings</a></div>
      <div class="grid cols-main">
        <div class="stack">
          <div class="card"><div class="kpis">
            <div class="kpi"><small>Margin / game</small><b class="${t.margin >= 0 ? "up" : "down"}">${t.gp ? signed(t.margin) : "—"}</b></div>
            <div class="kpi"><small>Strength of schedule</small><b>${t.gp ? t.sos.toFixed(1) : "—"}</b></div>
            <div class="kpi"><small>Points for</small><b>${t.gp ? t.pf.toFixed(1) : "—"}</b></div>
            <div class="kpi"><small>Points against</small><b>${t.gp ? t.pa.toFixed(1) : "—"}</b></div></div>
            <div class="kpis" style="margin-top:12px; border-top:0">
              <div class="kpi"><small>Home</small><b>${esc(t.home)}</b></div><div class="kpi"><small>Away</small><b>${esc(t.away)}</b></div><div class="kpi"><small>Neutral</small><b>${esc(t.neutral)}</b></div>
              <div class="kpi"><small>Rating rank</small><b>${t.gp ? t.rank : "—"}</b><span>of ${ratedTeams}</span></div></div></div>
          <div class="card plain">
            <div class="card-head"><h2>Schedule and results</h2><span class="muted">${playedSch.length} of ${sch.length} played</span></div>
            <div class="table-wrap"><table><thead><tr><th>Day</th><th>Type</th><th></th><th>Opponent</th><th class="c">Tier</th><th class="c">Result</th><th class="r">Score</th><th class="r">Record</th><th class="r">Margin</th></tr></thead><tbody>
              ${sch.map((s) => { const o = teams[s.opp]; const sd = core.seed.get(s.opp);
                if (s.played) { s.won ? rw++ : rl++; }
                return `<tr${s.played ? "" : ' class="upcoming"'}><td class="muted num">${s.g.day}</td><td class="muted">${esc(roundOf(s.g).replace("Non-conference", "Non-conf").replace("Conference Tournament", "Conf tourney"))}</td><td class="faint">${s.venue}</td><td>${teamLink(o)} <span class="faint num" style="font-size:.8rem">#${o.rank}${apRank.has(s.opp) ? ` &middot; AP ${apRank.get(s.opp)}` : ""}${sd && s.g.type === "NCAA" ? ` &middot; ${sd.seed}-seed` : ""}</span></td><td class="c"><span class="pill">${esc(o.tier)}</span></td>
                  <td class="c">${s.played ? `<span class="res ${s.won ? "W" : "L"}" style="display:inline-grid;place-items:center;width:26px;height:26px;border-radius:4px;font:800 .85rem var(--display)">${s.won ? "W" : "L"}</span>` : `<span class="faint">—</span>`}</td>
                  <td class="r num">${s.played ? `${s.us}-${s.them}` : `<span class="faint">upcoming</span>`}</td><td class="r num muted">${s.played ? `${rw}-${rl}` : ""}</td><td class="r num ${s.played ? (s.us > s.them ? "up" : "down") : ""}">${s.played ? signed(s.us - s.them, 0) : ""}</td></tr>`; }).join("")}
            </tbody></table></div>
          </div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Form</h2><span class="muted">Last 10: ${esc(t.last10 || "—")}</span></div><div class="form results">${form || '<span class="muted">No games yet</span>'}</div>
            <p class="muted" style="margin:14px 0 0">Streak: <b style="color:var(--text)">${esc(t.streak || "—")}</b>${next ? ` &middot; Next: day ${next.g.day}, ${next.venue === "@" ? "at" : next.venue === "vs" ? "home vs" : "neutral vs"} ${esc(teams[next.opp].name)}` : ""}</p></div>
          <div class="card"><div class="card-head"><h2>Resume</h2></div>
            <p style="margin:0 0 10px"><span class="faint">Best win</span><br><b>${esc(t.bestWin)}</b></p>
            <p style="margin:0"><span class="faint">Worst loss</span><br><b>${esc(t.worstLoss)}</b></p></div>
          <div class="card"><div class="card-head"><h2>Sim stats</h2><span class="muted">starting vs current</span></div>
            <table><thead><tr><th></th><th class="r">Start</th><th class="r">Now</th><th class="r">Change</th></tr></thead><tbody>
              ${stats.map(([k, label]) => { const a = perGame(t.start, k), b = perGame(live, k), d = b - a; const good = k === "TO" ? d < 0 : d > 0; return `<tr><td class="muted">${label}</td><td class="r num">${a.toFixed(1)}</td><td class="r num"><b>${b.toFixed(1)}</b></td><td class="r num ${Math.abs(d) < 0.05 ? "muted" : good ? "up" : "down"}">${signed(d)}</td></tr>`; }).join("")}
            </tbody></table>
            <p class="faint" style="margin:10px 0 0;font-size:.8rem">The engine plays this team with ${(w * 100).toFixed(0)}% of its own results and ${(100 - w * 100).toFixed(0)}% of its season-start line (fully its own after ${S.ramp} games). Starting tier rating ${t.tierRating.toFixed(1)}.</p></div>
        </div>
      </div>`;
  } catch (err) { fail(view, err); }
})();
