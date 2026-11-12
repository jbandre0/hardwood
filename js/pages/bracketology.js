import { shell, fail } from "../ui.js";
import { loadCore, resetCores, esc, teamLink, articleHTML, signed } from "../data.js";
import { combobox } from "../combobox.js";
import { computeBoard } from "../league/bracketology.js";
import { suggestField, validateField, changeLabel, REGIONS } from "../league/field.js";
import { setContent, toOverlay } from "../league/league.js";
import { saveOverlay } from "../league/store.js";

(async function main() {
  const view = shell("bracketology");
  try {
    const core = await loadCore();
    const { state, teams, season } = core;
    const S = core.data.bracketology?.settings || { q1Rank: 25, q2Rank: 50, badLossRank: 100, winWeight: 8, q1Pts: 1.5, q2Pts: 0.75, badLossPts: 1.5, atLarge: 37, seedBump: 2 };
    const picksAll = () => state.content.picks;
    const weeks = () => [...new Set(picksAll().map((p) => p.week))].sort((a, b) => a - b);
    let week = weeks().length ? weeks()[weeks().length - 1] : null;
    let editing = false;

    function board() {
      const through = season.day;
      const adj = state.content.commAdj.filter((a) => a.week === (week ?? 0));
      const rows = computeBoard({ teams: teams.map((t) => ({ id: t.id, conf: t.conf, rating: t.rating, eff: t.eff })), games: state.games, throughDay: through, picks: picksAll().filter((p) => week != null && p.week === week - 1), commAdj: adj, settings: S }).rows;
      return rows;
    }
    async function persist() { await saveOverlay(season.id, toOverlay(state, state.extraGames || [])); resetCores(); }

    function render() {
      const wk = weeks(), cur = picksAll().filter((p) => p.week === week), prev = picksAll().filter((p) => p.week === week - 1);
      const pm = new Map(prev.map((p) => [p.team, p]));
      const art = state.content.articles.find((a) => (a.type || "").toLowerCase().includes("bracket") && a.week === week);
      const cell = (p) => { const t = teams[p.team]; const ch = changeLabel(p, pm.get(p.team)); return `<div class="bk-team">${p.seed ? `<span class="sd">${p.seed}</span>` : ""}${teamLink(t)}<span class="faint" style="font-size:.78rem">${p.bid === "Auto" ? "Auto" : ""}${p.ff ? " FF" : ""}</span><span class="${ch.startsWith("▲") ? "up" : ch.startsWith("▼") ? "down" : "faint"}" style="font-size:.78rem">${ch}</span></div>`; };
      const field = cur.filter((p) => p.group === "Field");
      const regionCard = (R) => `<div class="card"><div class="card-head"><h2>${R}</h2></div>${field.filter((p) => p.region === R).sort((a, b) => a.seed - b.seed).map(cell).join("")}</div>`;
      const group = (g) => cur.filter((p) => p.group === g).sort((a, b) => (a.bubble ?? 0) - (b.bubble ?? 0)).map(cell).join("") || '<span class="muted">None</span>';
      const val = week != null ? validateField(cur) : { errors: [], warnings: [] };
      view.innerHTML = `
        <div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Bracketology</h1>
          <p>The weekly projected field. Seeds come from a committee score: power rating, win percentage, quadrant wins and bad losses.</p></div>
        <div class="card" style="margin-bottom:18px"><div class="btn-row">
          ${wk.length ? `<div class="field" style="min-width:180px"><label for="wk">Week</label><div id="cbWk"></div></div>` : ""}
          <button class="btn ghost" id="edit" type="button">${editing ? "Close editor" : "Edit / new week"}</button></div></div>
        ${editing ? editor() : ""}
        ${week == null ? '<div class="card empty"><h3>No bracketology yet</h3><p>Use Edit / new week to suggest a field from the current results.</p></div>' : `
        ${val.errors.length ? `<div class="card" style="margin-bottom:18px;border-color:var(--down)"><b>Field problems</b><ul>${val.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
        <div class="grid cols-2" style="margin-bottom:18px">${REGIONS.map(regionCard).join("")}</div>
        <div class="grid cols-2" style="margin-bottom:18px"><div class="card"><div class="card-head"><h2>First Four Out</h2></div>${group("First Four Out")}</div><div class="card"><div class="card-head"><h2>Next Four Out</h2></div>${group("Next Four Out")}</div></div>
        ${art ? `<div class="card"><div class="card-head"><h2>${esc(art.headline || art.heading || "This week")}</h2></div><div class="prose">${articleHTML(art.body)}</div></div>` : ""}`}`;
      if (wk.length) combobox(document.getElementById("cbWk"), { id: "wk", value: String(week), options: wk.map((w) => ({ value: String(w), label: w === 0 ? "Preseason" : "Week " + w })), onChange: (v) => { week = +v; render(); } });
      document.getElementById("edit").onclick = () => { editing = !editing; render(); };
      if (editing) wireEditor();
    }

    function editor() {
      return `<div class="card" style="margin-bottom:18px" id="ed"><div class="card-head"><h2>Editor</h2><span class="muted">${season.status === "complete" ? "This season is complete; edits change the archive in this browser only." : "Through day " + season.day}</span></div>
        <p class="muted">Suggest builds a full field from the Board for a new week (auto-bid = best Score per conference). Seeds are set by S-curve and do not avoid conference rematches, so review before saving. Saved to this browser; use Commissioner export to back up.</p>
        <div class="btn-row"><button class="btn" id="suggest" type="button">Suggest week ${(weeks().slice(-1)[0] ?? -1) + 1}</button><button class="btn ghost" id="del" type="button" ${week == null ? "disabled" : ""}>Delete week ${week ?? ""}</button></div><p id="edmsg" class="muted"></p></div>`;
    }
    function wireEditor() {
      const msg = document.getElementById("edmsg");
      document.getElementById("suggest").onclick = async () => {
        const nw = (weeks().slice(-1)[0] ?? -1) + 1, rows = board();
        const picks = suggestField(rows, S.atLarge).map((p) => ({ ...p, week: nw }));
        const v = validateField(picks);
        if (v.errors.length) { msg.textContent = "Suggested field invalid: " + v.errors[0]; return; }
        setContent(state, "picks", [...picksAll(), ...picks]);
        const ap = state.content.ap; state.content.weeks[nw] = season.day;
        await persist(); location.reload();
      };
      document.getElementById("del").onclick = async () => {
        if (!confirm(`Delete bracketology week ${week}? This cannot be undone (backup first).`)) return;
        setContent(state, "picks", picksAll().filter((p) => p.week !== week));
        await persist(); location.reload();
      };
    }
    render();
  } catch (e) { fail(view, e); }
})();
