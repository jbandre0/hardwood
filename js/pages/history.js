import { shell, fail } from "../ui.js";
import { loadAllSeasons, esc, teamLinkPlain as teamLink, signed } from "../data.js";
import { combobox } from "../combobox.js";
import { titlesTable, allTime, mostImproved, streaks, headToHead } from "../league/history.js";

(async function main() {
  const view = shell("history");
  view.innerHTML = `<div class="page-title"><span class="kicker">Every season</span><h1>History</h1><p class="muted">Loading every season…</p></div>`;
  try {
    const seasons = await loadAllSeasons();
    const core = seasons[seasons.length - 1].core, teams = core.teams, names = core.league.map((t) => t.name);
    const done = seasons.filter((s) => s.summary.title);
    const T = titlesTable(seasons, names), A = allTime(seasons), M = mostImproved(seasons, names, 8), K = streaks(seasons, names);
    const qs = new URLSearchParams(location.search);
    let board = "titles", a = teams.find((t) => t.slug === qs.get("a"))?.id ?? 342, b = teams.find((t) => t.slug === qs.get("b"))?.id ?? 267;
    const BOARDS = { titles: ["Titles", (r) => r.titles, (r) => `${r.titles} title${r.titles === 1 ? "" : "s"}${r.runnerUps ? `, ${r.runnerUps} runner-up` : ""}`],
      ff: ["Final Fours", (r) => r.finalFours, (r) => `${r.finalFours}`], app: ["NCAA bids", (r) => r.appearances, (r) => `${r.appearances} of ${done.length}`],
      tw: ["Tournament wins", (r) => r.tourneyW, (r) => `${r.tourneyW}-${r.tourneyL}`], ct: ["Conf. tournament titles", (r) => r.ctTitles, (r) => `${r.ctTitles}`],
      wins: ["Total wins", (r) => r.wins, (r) => `${r.wins}-${r.losses}`] };

    const confRow = (r) => `<tr><td>${esc(r.conf)}</td><td class="r num"><b>${r.titles}</b></td><td class="r num">${r.finalFours}</td><td class="r num">${r.bids}</td><td class="r num">${r.tourneyW}</td></tr>`;
    const soFar = (label) => (seasons.find((x) => x.label === label)?.status === "complete" ? "" : " (so far)");
    function render() {
      const [, key, show] = BOARDS[board];
      const rows = A.teams.filter((r) => key(r) > 0).sort((x, y) => key(y) - key(x) || y.wins - x.wins).slice(0, 15);
      const confs = A.confs.slice().sort((x, y) => y.titles - x.titles || y.finalFours - x.finalFours || y.tourneyW - x.tourneyW);
      const blueDroughts = K.droughts.filter((d) => (d.tier === "S" || d.tier === "A") && d.seasonsWithoutBid > 0).sort((x, y) => y.seasonsWithoutBid - x.seasonsWithoutBid || x.name.localeCompare(y.name));
      const activeApps = K.appearances.filter((x) => x.active && x.length >= 2).slice(0, 10);
      view.innerHTML = `
        <div class="page-title"><span class="kicker">${seasons.length} season${seasons.length === 1 ? "" : "s"} &middot; ${done.length} finished</span><h1>History</h1>
          <p>Champions, all-time leaders, dynasties and droughts across every season played, plus head-to-head records between any two teams.</p></div>
        <div class="card plain" style="margin-bottom:18px"><div class="card-head"><h2>Champions</h2></div>
          <div class="table-wrap"><table><thead><tr><th>Season</th><th>Champion</th><th class="c">Seed</th><th class="r">Record</th><th>Runner-up</th><th class="r">Final</th><th>Final Four</th><th class="r">Upsets</th></tr></thead><tbody>
            ${T.map((r) => r.champion != null ? `<tr><td><b>${esc(r.label)}</b></td><td>${teamLink(teams[r.champion])}</td><td class="c">${r.championSeed ?? ""}</td><td class="r num">${r.championRecord}</td><td>${teamLink(teams[r.runnerUp])}</td><td class="r num">${r.score}</td><td class="muted">${r.finalFour.map((id) => esc(names[id])).join(", ")}</td><td class="r num">${r.upsets}</td></tr>`
              : `<tr class="upcoming"><td><b>${esc(r.label)}</b></td><td colspan="7" class="muted">${r.status === "complete" ? "No tournament recorded" : "In progress"}</td></tr>`).join("")}
          </tbody></table></div></div>
        <div class="grid cols-main" style="margin-bottom:18px">
          <div class="card plain"><div class="card-head"><h2>All-time leaders</h2></div>
            <div class="seg" style="margin-bottom:12px" id="boards">${Object.entries(BOARDS).map(([k, [label]]) => `<button type="button" data-b="${k}" class="${k === board ? "on" : ""}">${label}</button>`).join("")}</div>
            <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th class="r">${BOARDS[board][0]}</th><th class="r">NCAA bids</th><th class="r">Best rank</th></tr></thead><tbody>
              ${rows.map((r, i) => `<tr><td class="rank c">${i + 1}</td><td>${teamLink(teams[r.id])}</td><td class="r num"><b>${show(r)}</b></td><td class="r num muted">${r.appearances}</td><td class="r num muted">${r.bestRank ?? "—"}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nothing yet.</td></tr>`}
            </tbody></table></div></div>
          <div class="card plain"><div class="card-head"><h2>Conferences</h2></div><div class="table-wrap"><table><thead><tr><th>Conference</th><th class="r">Titles</th><th class="r">Final Fours</th><th class="r">Bids</th><th class="r">NCAA W</th></tr></thead><tbody>
            ${confs.slice(0, 10).map(confRow).join("")}</tbody></table></div>
            ${confs.length > 10 ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer">All ${confs.length} conferences</summary><div class="table-wrap"><table><tbody>${confs.slice(10).map(confRow).join("")}</tbody></table></div></details>` : ""}</div>
        </div>
        <div class="grid cols-2" style="margin-bottom:18px">
          <div class="card plain"><div class="card-head"><h2>Most improved</h2><span class="muted">rating, season over season</span></div>
            ${M.improved.length ? `<div class="table-wrap"><table><thead><tr><th>Team</th><th>Seasons</th><th class="r">Before</th><th class="r">After</th><th class="r">Change</th></tr></thead><tbody>
              ${M.improved.map((r) => `<tr><td>${teamLink(teams[r.id])}</td><td class="muted">${esc(r.to)}${soFar(r.to)}</td><td class="r num muted">${r.before.toFixed(1)} <span class="faint">(${r.winsBefore})</span></td><td class="r num">${r.after.toFixed(1)} <span class="faint">(${r.winsAfter})</span></td><td class="r num up">${signed(r.delta)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Needs two seasons with at least five games each.</p>`}</div>
          <div class="card plain"><div class="card-head"><h2>Biggest drops</h2></div>
            ${M.declined.length ? `<div class="table-wrap"><table><thead><tr><th>Team</th><th>Seasons</th><th class="r">Before</th><th class="r">After</th><th class="r">Change</th></tr></thead><tbody>
              ${M.declined.map((r) => `<tr><td>${teamLink(teams[r.id])}</td><td class="muted">${esc(r.to)}${soFar(r.to)}</td><td class="r num muted">${r.before.toFixed(1)} <span class="faint">(${r.winsBefore})</span></td><td class="r num">${r.after.toFixed(1)} <span class="faint">(${r.winsAfter})</span></td><td class="r num down">${signed(r.delta)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Needs two seasons.</p>`}</div>
        </div>
        <div class="grid cols-2" style="margin-bottom:18px">
          <div class="card"><div class="card-head"><h2>Dynasty watch</h2></div>
            <p class="muted" style="margin-top:-4px">Longest runs in finished seasons. A run that includes the latest finished season is still alive.</p>
            ${[["Back-to-back titles", K.titles.filter((x) => x.length >= 2)], ["Consecutive Final Fours", K.finalFours.filter((x) => x.length >= 2)], ["Active NCAA bid streaks", activeApps]].map(([h, list]) =>
              `<h3 style="margin:14px 0 6px">${h}</h3>${list.length ? list.slice(0, 8).map((x) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(x.name)}${x.active ? ' <span class="pill mint">active</span>' : ""}</span><span class="num muted">${x.length} through ${esc(x.through)}</span></div>`).join("") : '<p class="faint" style="margin:0">Nobody yet.</p>'}`).join("")}</div>
          <div class="card"><div class="card-head"><h2>Drought tracker</h2><span class="muted">tier S and A teams</span></div>
            <p class="muted" style="margin-top:-4px">Finished seasons in a row without an NCAA bid, counting back from the latest one.</p>
            ${blueDroughts.length ? blueDroughts.slice(0, 14).map((d) => `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--line)"><span><a href="${"team.html?t=" + teams[d.id].slug}">${esc(d.name)}</a> <span class="pill">${d.tier}</span></span><span class="num ${d.never ? "down" : "muted"}">${d.never ? `never (${d.seasonsWithoutBid})` : d.seasonsWithoutBid}</span></div>`).join("") : '<p class="faint">Every S and A tier team made the last tournament.</p>'}</div>
        </div>
        <div class="card" id="h2h"><div class="card-head"><h2>Head to head</h2></div>
          <div class="grid cols-2" style="gap:12px;margin-bottom:14px"><div class="field"><label for="ha">Team</label><div id="cbA"></div></div><div class="field"><label for="hb">Opponent</label><div id="cbB"></div></div></div>
          <div id="h2hOut"></div></div>`;
      view.querySelectorAll("#boards button").forEach((x) => x.onclick = () => { board = x.dataset.b; render(); });
      const opts = teams.map((t) => ({ value: String(t.id), label: t.name, search: t.conf }));
      combobox(view.querySelector("#cbA"), { id: "ha", value: String(a), options: opts, onChange: (v) => { a = +v; h2h(); } });
      combobox(view.querySelector("#cbB"), { id: "hb", value: String(b), options: opts, onChange: (v) => { b = +v; h2h(); } });
      h2h();
    }
    function h2h() {
      history.replaceState(null, "", `?a=${teams[a].slug}&b=${teams[b].slug}`);
      const H = headToHead(seasons, a, b), out = view.querySelector("#h2hOut");
      if (a === b) { out.innerHTML = `<p class="muted">Pick two different teams.</p>`; return; }
      out.innerHTML = H.games.length ? `<p style="margin:0 0 10px"><b>${esc(names[a])} ${H.aWins}-${H.bWins}</b> against ${esc(names[b])} <span class="muted">&middot; points ${H.aPts}-${H.bPts}</span></p>
        <div class="table-wrap"><table><thead><tr><th>Season</th><th class="r">Day</th><th>Game</th><th>Site</th><th class="r">Score</th><th class="c">Result</th></tr></thead><tbody>
          ${H.games.map((g) => `<tr><td>${esc(g.season)}</td><td class="r num muted">${g.day}</td><td class="muted">${g.type === "NCAA" ? esc(g.ctx) : g.type === "CT" ? "Conf. tournament" : g.type === "Conf" ? "Conference" : "Non-conference"}</td><td class="muted">${g.site === "home" ? `at ${esc(names[a])}` : g.site === "away" ? `at ${esc(names[b])}` : "neutral"}</td><td class="r num">${g.aPts}-${g.bPts}</td><td class="c"><span class="res ${g.aWon ? "W" : "L"}" style="display:inline-grid;place-items:center;width:24px;height:24px;border-radius:4px;font:800 .8rem var(--display)">${g.aWon ? "W" : "L"}</span></td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">These two haven't played each other yet. <a href="matchup.html?a=${teams[a].slug}&b=${teams[b].slug}" style="color:var(--accent)">Simulate it</a>.</p>`;
    }
    render();
  } catch (e) { fail(view, e); }
})();
