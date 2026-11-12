import { shell, fail } from "../ui.js";
import { loadCore, loadAllSeasons, esc, teamLink, signed, roundOf } from "../data.js";
import { gameRows, brokenOn } from "../league/leaders.js";
import { dayRecap, dayDone } from "../league/recap.js";

(async function main() {
  const view = shell("play");
  try {
    const core = await loadCore();
    const { state, season, teams } = core;
    const qs = new URLSearchParams(location.search);
    let day = +qs.get("day") || season.day;
    if (!dayDone(state, day)) day = Math.max(1, day - 1);
    const R = dayRecap(state, day);
    const pct = (p) => `${Math.round(p * 100)}%`;
    const score = (g) => { const aw = g.ptsA > g.ptsB; return `<tr><td>${teamLink(teams[g.a])}</td><td class="r num ${aw ? "w" : "muted"}">${g.ptsA}</td><td class="faint c">${g.home ? "at" : "vs"}</td><td>${teamLink(teams[g.b])}</td><td class="r num ${aw ? "muted" : "w"}">${g.ptsB}</td><td>${g.ot ? `<span class="pill">${g.ot > 1 ? g.ot : ""}OT</span>` : ""}${g.pWin < 0.3 ? ' <span class="pill warm">upset</span>' : ""}</td><td class="muted">${esc(roundOf(g))}</td></tr>`; };
    const mv = (x) => x.prev == null ? '<span class="pill warm">NEW</span>' : x.prev === x.rank ? '<span class="faint">—</span>' : x.prev > x.rank ? `<span class="up">▲ ${x.prev - x.rank}</span>` : `<span class="down">▼ ${x.rank - x.prev}</span>`;
    const top = R.upsets[0];
    const finished = !R.nextDay;
    view.innerHTML = `
      <div class="page-title"><span class="kicker">${esc(season.label)} &middot; ${R.games.length} games</span><h1>Day ${day} is in the books</h1>
        <p>${top ? `Upset of the day: <b>${esc(teams[top.w].name)}</b> beat ${esc(teams[top.l].name)} ${Math.max(top.ptsA, top.ptsB)}-${Math.min(top.ptsA, top.ptsB)}, a ${pct(top.pWin)} shot going in. ` : ""}${R.upsets.length} upset${R.upsets.length === 1 ? "" : "s"} in all, ${R.overtime.length} overtime game${R.overtime.length === 1 ? "" : "s"}, home teams ${R.homeRecord}. ${R.fellUnbeaten.length ? `Lost their perfect record: ${R.fellUnbeaten.map((x) => esc(x.name)).join(", ")}. ` : ""}${R.unbeatenNow} unbeaten left${R.unbeatenBefore !== R.unbeatenNow ? ` (was ${R.unbeatenBefore})` : ""}.</p></div>
      <div class="card" style="margin-bottom:18px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between">
        <div class="btn-row">
          ${finished ? `<a class="btn" href="play.html">Back to the desk</a>` : `<a class="btn" id="goNext" href="play.html">Start day ${R.nextDay} (${R.nextGames} games)</a>`}
          <a class="btn ghost" href="rankings.html">Full power rankings</a><a class="btn ghost" href="standings.html">Standings</a>
        </div>
        <div class="btn-row">${day > 1 ? `<a class="btn ghost" href="recap.html?day=${day - 1}">&larr; Day ${day - 1}</a>` : ""}${dayDone(state, day + 1) ? `<a class="btn ghost" href="recap.html?day=${day + 1}">Day ${day + 1} &rarr;</a>` : ""}</div>
      </div>
      <div class="grid cols-main" style="margin-bottom:18px">
        <div class="card plain"><div class="card-head"><h2>Power rankings after day ${day}</h2><span class="muted">top 25, movement since day ${day - 1}</span></div>
          <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th class="r">Record</th><th class="c">Move</th><th class="r">Rating</th><th class="r">Today</th></tr></thead><tbody>
            ${R.top25.map((x) => `<tr><td class="rank c">${x.rank}</td><td>${teamLink(teams[x.id])}</td><td class="r num">${x.rec}</td><td class="c">${mv(x)}</td><td class="r num"><b>${x.rating.toFixed(1)}</b></td><td class="r num ${x.playedToday ? (x.delta >= 0 ? "up" : "down") : "faint"}">${x.playedToday ? signed(x.delta) : "idle"}</td></tr>`).join("")}
          </tbody></table></div></div>
        <div class="stack">
          <div class="card plain"><div class="card-head"><h2>Upsets</h2><span class="muted">chance going in</span></div>
            ${R.upsets.length ? `<div class="table-wrap"><table><tbody>${R.upsets.slice(0, 8).map((g) => `<tr><td>${teamLink(teams[g.w])}</td><td class="faint">over</td><td>${esc(teams[g.l].name)}</td><td class="r num">${Math.max(g.ptsA, g.ptsB)}-${Math.min(g.ptsA, g.ptsB)}</td><td class="r num warm">${pct(g.pWin)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Chalk all day. Every favorite won.</p>'}</div>
          <div class="card plain"><div class="card-head"><h2>Biggest movers</h2><span class="muted">rating change today</span></div>
            <div class="table-wrap"><table><tbody>
              ${R.risers.map((x) => `<tr><td>${teamLink(teams[x.id])}</td><td class="r num muted">${x.rec}</td><td class="r num">#${x.rank} <span class="faint">(${x.prev})</span></td><td class="r num up">${signed(x.delta)}</td></tr>`).join("")}
              ${R.fallers.map((x) => `<tr><td>${teamLink(teams[x.id])}</td><td class="r num muted">${x.rec}</td><td class="r num">#${x.rank} <span class="faint">(${x.prev})</span></td><td class="r num down">${signed(x.delta)}</td></tr>`).join("")}
            </tbody></table></div></div>
          <div class="card"><div class="card-head"><h2>Notables</h2></div>
            ${R.blowout ? `<p style="margin:0 0 6px"><span class="faint">Biggest blowout</span><br>${esc(teams[R.blowout.w].name)} by ${R.blowout.margin} over ${esc(teams[R.blowout.l].name)}</p>` : ""}
            ${R.closest ? `<p style="margin:0 0 6px"><span class="faint">Closest</span><br>${esc(teams[R.closest.w].name)} ${Math.max(R.closest.ptsA, R.closest.ptsB)}-${Math.min(R.closest.ptsA, R.closest.ptsB)} ${esc(teams[R.closest.l].name)}${R.closest.ot ? " (OT)" : ""}</p>` : ""}
            ${R.highest ? `<p style="margin:0"><span class="faint">Highest scoring</span><br>${esc(teams[R.highest.a].name)} ${R.highest.ptsA}, ${esc(teams[R.highest.b].name)} ${R.highest.ptsB} (${R.highest.ptsA + R.highest.ptsB} points)</p>` : ""}</div>
        </div>
      </div>
      <div id="records"></div>
      <div class="card plain"><div class="card-head"><h2>Every result</h2><span class="muted">${R.games.length} games</span></div>
        <div class="table-wrap"><table><tbody>${R.games.map(score).join("")}</tbody></table></div></div>`;
    // league records set today, against every game ever played in the league (all seasons)
    loadAllSeasons().then((all) => {
      const seasons = all.map((x) => ({ label: x.label, rows: gameRows(x.core.state, x.label) }));
      const broken = brokenOn(seasons, season.label, day);
      const box = document.getElementById("records"); if (!box || !broken.length) return;
      const nm = (id) => esc(teams[id].name);
      box.innerHTML = `<div class="card" style="margin-bottom:18px;border-color:var(--warm)"><div class="card-head"><h2>New league record${broken.length > 1 ? "s" : ""}</h2><a href="stats.html?tab=records" class="muted">Records book</a></div>
        ${broken.map((b) => { const r = b.entry.row, w = r.ptsA > r.ptsB ? r.a : r.b, who = b.entry.team != null ? nm(b.entry.team) : (b.key === "margin" ? `${nm(w)} over ${nm(w === r.a ? r.b : r.a)}` : `${nm(r.a)} vs ${nm(r.b)}`);
          const pr = b.previous, pw = pr ? (pr.row.ptsA > pr.row.ptsB ? pr.row.a : pr.row.b) : null;
          return `<div style="display:grid;grid-template-columns:1fr auto;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)"><span><span class="pill warm">RECORD</span> <b>${esc(b.title)}</b><br><span class="muted" style="font-size:.88rem">${who}, ${r.ptsA}-${r.ptsB}${pr ? `. Old mark: ${pr.text}, ${pr.team != null ? esc(teams[pr.team].name) : esc(teams[pr.row.a].name) + " vs " + esc(teams[pr.row.b].name)} (${esc(pr.row.label)}, day ${pr.row.day}).` : ""}</span></span><b class="num" style="font-size:1.4rem">${b.entry.text}</b></div>`; }).join("")}</div>`;
    }).catch(() => {});
    document.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.target.closest("input, textarea, a, button, [role=combobox]")) { e.preventDefault(); location.href = "play.html"; } });
  } catch (e) { fail(view, e); }
})();
