import { shell, fail } from "../ui.js";
import { loadCore, loadAllSeasons, esc, teamLink, roundOf } from "../data.js";
import { combobox } from "../combobox.js";
import { CATEGORIES, teamLeaders, minGames, gameRows, recordBoard } from "../league/leaders.js";

(async function main() {
  const view = shell("stats");
  try {
    const core = await loadCore();
    const { teams, season, calc: c } = core;
    const totals = c.teams.map((t) => t.totals), minG = minGames(totals), maxGP = Math.max(...totals.map((t) => t.G));
    const qs = new URLSearchParams(location.search);
    let tab = ["leaders", "records", "league"].includes(qs.get("tab")) ? qs.get("tab") : "leaders", cat = CATEGORIES.some((x) => x[0] === qs.get("cat")) ? qs.get("cat") : "ppg", scope = "season", conf = "";
    let allRows = null;
    const rowsThis = gameRows(core.state, season.label);

    function leaders() {
      const [, label, , better, fmt, note] = CATEGORIES.find((x) => x[0] === cat);
      let L = teamLeaders(totals, cat, minG);
      if (conf) L = L.filter((r) => teams[r.id].conf === conf).map((r, i) => ({ ...r, rank: i + 1 }));
      const glance = ["ppg", "oppg", "net", "tp", "reb", "st"].map((k) => { const cc = CATEGORIES.find((x) => x[0] === k), top = teamLeaders(totals, k, minG).slice(0, 3); return `<div class="card"><div class="card-head"><h3 style="margin:0">${cc[1]}</h3><a href="?tab=leaders&cat=${k}" class="muted" data-cat="${k}">all</a></div>${top.map((r) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--line)"><span>${teamLink(teams[r.id])}</span><b class="num">${cc[4](r.value)}</b></div>`).join("")}</div>`; }).join("");
      return `${maxGP ? `<div class="grid cols-2" style="grid-template-columns:repeat(auto-fit,minmax(250px,1fr));margin-bottom:18px">${glance}</div>` : ""}
        <div class="card plain"><div class="card-head"><h2>${esc(label)}</h2><span class="muted">${esc(note)} &middot; minimum ${minG} games</span></div>
          <div class="btn-row" style="margin-bottom:12px"><div class="field" style="min-width:230px"><label for="cat">Category</label><div id="cbCat"></div></div><div class="field" style="min-width:200px"><label for="cf">Conference</label><div id="cbConf"></div></div></div>
          <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th>Conf</th><th class="r">Record</th><th class="r">${esc(label)}</th></tr></thead><tbody>
            ${L.slice(0, 50).map((r) => { const t = teams[r.id]; return `<tr><td class="rank c">${r.rank}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td class="r num muted">${t.w}-${t.l}</td><td class="r num"><b>${fmt(r.value)}</b></td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">Nobody has played enough games yet.</td></tr>`}
          </tbody></table></div></div>`;
    }

    function recordsHTML(rows) {
      const names = (id) => teams[id].name;
      const board = recordBoard(rows, 5);
      return `<div class="grid cols-2" style="grid-template-columns:repeat(auto-fit,minmax(340px,1fr))">${board.map((rec) => `<div class="card plain"><div class="card-head"><h3 style="margin:0">${esc(rec.title)}</h3></div>
        ${rec.top.map((e, i) => { const r = e.row, w = r.ptsA > r.ptsB ? r.a : r.b, who = e.team != null ? esc(names(e.team)) : (rec.key === "margin" ? `${esc(names(w))} over ${esc(names(w === r.a ? r.b : r.a))}` : `${esc(names(r.a))} vs ${esc(names(r.b))}`), opp = e.team != null ? (e.team === r.a ? r.b : r.a) : null;
          return `<div style="display:grid;grid-template-columns:28px 1fr auto;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:.9rem;${i === 0 ? "font-weight:600" : ""}"><span class="rank">${i + 1}</span><span>${who}${opp != null ? ` <span class="faint">vs ${esc(names(opp))}</span>` : ""}<br><span class="faint" style="font-size:.78rem;font-weight:400">${scope === "all" ? esc(r.label) + " &middot; " : ""}Day ${r.day} &middot; ${esc(roundOf({ type: r.type, day: r.day, ctx: r.ctx }))} &middot; ${r.ptsA}-${r.ptsB}${r.ot ? ` (${r.ot > 1 ? r.ot : ""}OT)` : ""}</span></span><b class="num">${e.text}</b></div>`; }).join("") || '<p class="muted">Nothing yet.</p>'}</div>`).join("")}</div>`;
    }

    function league() {
      const G = core.games.filter((g) => g.played), reg = G.filter((g) => g.type === "Reg" || g.type === "Conf");
      const t = totals.reduce((s, x) => ({ G: s.G + x.G, PF: s.PF + x.PF, FGM: s.FGM + x.FGM, FGA: s.FGA + x.FGA, TPM: s.TPM + x.TPM, TPA: s.TPA + x.TPA, FTM: s.FTM + x.FTM, FTA: s.FTA + x.FTA, OR: s.OR + x.OR, DR: s.DR + x.DR, TO: s.TO + x.TO, ST: s.ST + x.ST, POSS: s.POSS + x.POSS }), { G: 0, PF: 0, FGM: 0, FGA: 0, TPM: 0, TPA: 0, FTM: 0, FTA: 0, OR: 0, DR: 0, TO: 0, ST: 0, POSS: 0 });
      const n = t.G || 1, homeG = reg.filter((g) => g.home), hw = homeG.filter((g) => g.ptsB > g.ptsA).length;
      const ot = rowsThis.filter((r) => r.ot).length;
      const by = new Map(); for (const tm of teams) { const T = totals[tm.id]; if (!T.G) continue; const r = by.get(tm.conf) || { conf: tm.conf, G: 0, PF: 0, PA: 0, POSS: 0, TPA: 0, FGA: 0, n: 0 }; r.G += T.G; r.PF += T.PF; r.PA += T.PA; r.POSS += T.POSS; r.TPA += T.TPA; r.FGA += T.FGA; r.n++; by.set(tm.conf, r); }
      const K = (l, v, sub) => `<div class="kpi"><small>${l}</small><b>${v}</b><span>${sub || ""}</span></div>`;
      return `<div class="card" style="margin-bottom:18px"><div class="kpis">
          ${K("Points / team", (t.PF / n).toFixed(1), "calibrated to 75.8")}${K("Possessions", (t.POSS / n).toFixed(1), "calibrated to 69.2")}${K("3PA share", (t.TPA / t.FGA * 100).toFixed(1) + "%", "calibrated to 39.6%")}${K("FT attempts", (t.FTA / n).toFixed(1), "calibrated to 20.5")}</div>
          <div class="kpis" style="margin-top:12px;border-top:0">${K("FG%", (t.FGM / t.FGA * 100).toFixed(1) + "%")}${K("3P%", (t.TPM / t.TPA * 100).toFixed(1) + "%")}${K("FT%", (t.FTM / t.FTA * 100).toFixed(1) + "%")}${K("Turnovers", (t.TO / n).toFixed(1))}${K("Home teams", homeG.length ? (hw / homeG.length * 100).toFixed(1) + "%" : "—", `${hw}-${homeG.length - hw}`)}${K("Overtime games", ot, `${(ot / Math.max(1, rowsThis.length) * 100).toFixed(1)}% of games`)}</div></div>
        <div class="card plain"><div class="card-head"><h2>By conference</h2><span class="muted">${esc(season.label)}, all games</span></div><div class="table-wrap"><table><thead><tr><th>Conference</th><th class="r">Games</th><th class="r">Points</th><th class="r">Allowed</th><th class="r">Pace</th><th class="r">3PA share</th></tr></thead><tbody>
          ${[...by.values()].sort((a, b) => b.PF / b.G - a.PF / a.G).map((r) => `<tr><td>${esc(r.conf)}</td><td class="r num muted">${r.G / 2 | 0}</td><td class="r num">${(r.PF / r.G).toFixed(1)}</td><td class="r num">${(r.PA / r.G).toFixed(1)}</td><td class="r num">${(r.POSS / r.G).toFixed(1)}</td><td class="r num">${(r.TPA / r.FGA * 100).toFixed(1)}%</td></tr>`).join("")}</tbody></table></div></div>`;
    }

    async function draw() {
      history.replaceState(null, "", `?tab=${tab}${tab === "leaders" ? "&cat=" + cat : ""}`);
      const body = document.getElementById("body");
      if (tab === "leaders") { body.innerHTML = leaders(); wireLeaders(); }
      else if (tab === "league") body.innerHTML = league();
      else {
        body.innerHTML = `<div class="seg" style="margin-bottom:14px" id="scope"><button type="button" data-s="season" class="${scope === "season" ? "on" : ""}">${esc(season.label)}</button><button type="button" data-s="all" class="${scope === "all" ? "on" : ""}">All seasons</button></div><div id="recs"><p class="muted">${scope === "all" && !allRows ? "Loading every season…" : ""}</p></div>`;
        body.querySelectorAll("#scope button").forEach((b) => b.onclick = () => { scope = b.dataset.s; draw(); });
        if (scope === "all" && !allRows) { allRows = (await loadAllSeasons()).flatMap((s) => gameRows(s.core.state, s.label)); }
        const recs = document.getElementById("recs"); if (recs) recs.innerHTML = recordsHTML(scope === "all" ? allRows : rowsThis);
      }
      view.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab));
    }
    function wireLeaders() {
      combobox(document.getElementById("cbCat"), { id: "cat", value: cat, options: CATEGORIES.map((x) => ({ value: x[0], label: x[1] })), onChange: (v) => { cat = v; draw(); } });
      combobox(document.getElementById("cbConf"), { id: "cf", value: conf, options: [{ value: "", label: "All conferences" }, ...core.confs.map((x) => ({ value: x, label: x }))], onChange: (v) => { conf = v; draw(); } });
      view.querySelectorAll("a[data-cat]").forEach((a) => a.onclick = (e) => { e.preventDefault(); cat = a.dataset.cat; draw(); window.scrollTo({ top: document.getElementById("cbCat").getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); });
    }

    view.innerHTML = `
      <div class="page-title"><span class="kicker">${esc(season.label)} &middot; ${season.played.toLocaleString()} games</span><h1>Stats</h1>
        <p>Team leaders, single-game records and the league's scoring environment, all computed from the box scores of every game played.</p></div>
      <div class="seg" style="margin-bottom:16px" id="tabs"><button type="button" data-t="leaders">Team leaders</button><button type="button" data-t="records">Records</button><button type="button" data-t="league">League</button></div>
      <div id="body"></div>`;
    view.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    await draw();
  } catch (e) { fail(view, e); }
})();
