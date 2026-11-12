import { shell, fail } from "../ui.js";
import { combobox } from "../combobox.js";
import { loadCore, resetCores, esc, badge, teamLink, signed } from "../data.js";
import { rollAndRecord, rollGame, recordRolled, playDay, undoLast, toOverlay, nextUnplayed, calc, setContent, syncTournament } from "../league/league.js";
import { computeBoard } from "../league/bracketology.js";
import { suggestField, validateField } from "../league/field.js";
import { lockDay, lockPrediction, DEFAULT_SIMS } from "../league/predictions.js";
import { saveOverlay, clearOverlay, exportAll, importAll, loadOverlay, unsavedSince } from "../league/store.js";

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const predOn = () => { try { return localStorage.getItem("hw-pred-on") !== "0"; } catch { return true; } };
const predSims = () => { try { return +localStorage.getItem("hw-pred-sims") || DEFAULT_SIMS; } catch { return DEFAULT_SIMS; } };
const fmt = (n) => n.toLocaleString();

(async function main() {
  const view = shell("play");
  let last = null; // last action's summary, kept across re-renders
  try { await render(); } catch (e) { fail(view, e); }

  async function render() {
    resetCores();
    const core = await loadCore();
    const { state, season, teams, games } = core;
    const complete = season.status === "complete";
    const nxt = nextUnplayed(state);
    const nextDay = nxt ? nxt.day : null;
    const dayGames = nextDay ? games.filter((g) => g.day === nextDay && !g.played && g.a != null) : [];
    const overlay = await loadOverlay(season.id).catch(() => null);
    const unsaved = unsavedSince(season.id, overlay);
    const mine = state.recorded.slice(-40).reverse();
    const regLeft = games.filter((g) => !g.played && (g.type === "Reg" || g.type === "Conf")).length;

    const fav = (g) => { const a = teams[g.a], b = teams[g.b]; const d = (a.rating - b.rating) - (g.home ? 3 : 0); return d >= 0 ? [a, d] : [b, -d]; };
    const resultRow = (r) => {
      const a = teams[r.a], b = teams[r.b], aw = r.ptsA > r.ptsB;
      const [f] = fav({ a: r.a, b: r.b, home: 1 });
      const upset = (aw ? a : b) !== f && Math.abs(a.rating - b.rating) > 4;
      return `<tr data-id="${r.id}" class="clickable"><td>${teamLink(a)}</td><td class="r num ${aw ? "w" : "muted"}">${r.ptsA}</td><td>${teamLink(b)}</td><td class="r num ${aw ? "muted" : "w"}">${r.ptsB}</td><td>${r.ot ? `<span class="pill">${r.ot > 1 ? r.ot : ""}OT</span>` : ""}${upset ? ' <span class="pill warm">upset</span>' : ""}</td></tr>`;
    };

    view.innerHTML = `
      <div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Commissioner desk</h1>
        <p>Roll games with the engine and record them. Everything you record is saved in this browser and can be backed up to a file at any time.</p></div>

      <div class="grid cols-main">
        <div class="stack">
          <div class="card">
            <div class="kpis">
              <div class="kpi"><small>Games played</small><b id="kPlayed">${fmt(season.played)}</b><span id="kTotal">of ${fmt(season.total)}</span></div>
              <div class="kpi"><small>Latest day</small><b>${season.day}</b><span>${season.day > 42 ? "of 54 (postseason)" : "of 42 regular-season days"}</span></div>
              <div class="kpi"><small>Next day</small><b>${nextDay ?? "—"}</b><span>${dayGames.length} games</span></div>
            </div>
            ${complete ? `<p class="muted" style="margin:14px 0 0">${esc(season.label)} is complete. Switch to the live season in the top bar to keep playing.</p>` :
              !nxt && season.day === 47 && !state.content.field ? `<p class="muted" style="margin:14px 0 0">Conference tournaments are done. Build the 68-team NCAA field from the results (every conference champion gets its auto-bid, the rest from the Bracketology Board). You can refine seeds on the Bracketology page first.</p>
                <div class="btn-row" style="margin-top:12px"><button class="btn" id="lockField" type="button">Build NCAA field</button><button class="btn ghost" id="undoDay" type="button">Undo last day</button></div><p class="status" id="status" aria-live="polite"></p>` :
              !nxt ? `<p class="muted" style="margin:14px 0 0">${season.day >= 54 ? "The season is over. Season champion is on the March Madness page." : "The regular season is complete. Conference tournaments (days 43-47) and the NCAA Tournament (days 48-54) come next."}</p>` : `
            <div class="btn-row" style="margin-top:16px">
              <button class="btn" id="playDay" type="button">Play day ${nextDay} (${dayGames.length} games)</button>
              <button class="btn ghost" id="playOne" type="button">Play one game</button>
              <button class="btn ghost" id="undoOne" type="button" ${state.recorded.length ? "" : "disabled"}>Undo last game</button>
              <button class="btn ghost" id="undoDay" type="button" ${state.recorded.length ? "" : "disabled"}>Undo last day</button>
            </div>
            <p class="status" id="status" aria-live="polite"></p>`}
          </div>

          ${!complete && nxt ? `<div class="card" id="gameDesk"></div>` : ""}

          ${last ? `<div class="card"><div class="card-head"><h2>${esc(last.title)}</h2><span class="muted">${last.rows.length} game${last.rows.length === 1 ? "" : "s"}</span></div>
            <div class="table-wrap"><table><tbody>${last.rows.map(resultRow).join("")}</tbody></table></div>
            <p class="faint" style="margin:10px 0 0;font-size:.82rem">Click a game for its box score.</p></div>` : ""}

          ${dayGames.length ? `<div class="card plain"><div class="card-head"><h2>Day ${nextDay} preview</h2><span class="muted">${dayGames.length} games, by rating gap</span></div>
            <div class="table-wrap"><table><thead><tr><th>Visitor</th><th>Host</th><th>Site</th><th class="r">Favorite</th></tr></thead><tbody>
              ${dayGames.map((g) => ({ g, f: fav(g) })).sort((x, y) => x.f[1] - y.f[1]).map(({ g, f }) => `<tr><td>${teamLink(teams[g.a])}</td><td>${teamLink(teams[g.b])}</td><td class="muted">${g.home ? "Host" : "Neutral"}</td><td class="r"><span class="muted">${esc(f[0].name)}</span> <b class="num">+${f[1].toFixed(1)}</b></td></tr>`).join("")}
            </tbody></table></div></div>` : ""}

          ${mine.length ? `<div class="card plain"><div class="card-head"><h2>Recorded on this site</h2><span class="muted">latest ${mine.length} of ${state.recorded.length}</span></div>
            <div class="table-wrap"><table><thead><tr><th>Day</th><th>Visitor</th><th class="r">Pts</th><th>Host</th><th class="r">Pts</th><th></th></tr></thead><tbody>
              ${mine.map((id) => { const g = games.find((x) => x.id === id); const a = teams[g.a], b = teams[g.b], bx = state.box.get(id); const aw = g.ptsA > g.ptsB;
                return `<tr data-id="${id}" class="clickable"><td class="muted num">${g.day}</td><td>${teamLink(a)}</td><td class="r num ${aw ? "w" : "muted"}">${g.ptsA}</td><td>${teamLink(b)}</td><td class="r num ${aw ? "muted" : "w"}">${g.ptsB}</td><td>${bx[1] ? `<span class="pill">${bx[1] > 1 ? bx[1] : ""}OT</span>` : ""}</td></tr>`; }).join("")}
            </tbody></table></div></div>` : ""}
        </div>

        <div class="stack">
          ${season.day >= 54 || complete ? `<div class="card"><div class="card-head"><h2>Offseason</h2></div><p class="muted" style="margin-top:0">Awards, the tier review and creating next season.</p><a class="btn" href="offseason.html">Open the offseason</a></div>` : ""}
          ${complete ? "" : `<div class="card">
            <div class="card-head"><h2>Predictions</h2><a href="predictions.html">Scorecard</a></div>
            <p class="muted" style="margin-top:0;font-size:.9rem">Before a game is played, the engine's prediction is locked and later scored. ${state.predictions.size.toLocaleString()} locked so far.</p>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="predOn" ${predOn() ? "checked" : ""}> Lock predictions before playing</label>
            <div class="field"><label for="predSims">Simulations per prediction</label><div id="cbSims"></div></div>
            <p class="faint" style="margin:8px 0 0;font-size:.8rem">More simulations = steadier numbers, slower days. 3,000 takes about 5-10 seconds a day.</p></div>`}
          <div class="card">
            <div class="card-head"><h2>Backup</h2></div>
            <p class="${unsaved ? "" : "muted"}" style="margin-top:0">${unsaved ? `<b style="color:var(--warm)">${unsaved} game${unsaved === 1 ? "" : "s"} recorded since your last backup.</b>` : state.recorded.length ? "Everything recorded here is in your last backup." : "Nothing recorded on this site yet."}</p>
            <p class="muted" style="font-size:.9rem">Games are saved in this browser only. A backup file holds everything for every season. Clearing site data or switching browsers would lose it, so download a backup after each session.</p>
            <div class="btn-row"><button class="btn" id="exportBtn" type="button">Download backup</button><label class="btn ghost" for="importFile" style="cursor:pointer">Restore from backup</label><input id="importFile" type="file" accept="application/json,.json" hidden></div>
            <p class="status" id="bstatus" aria-live="polite"></p>
          </div>
          ${complete ? "" : `<div class="card">
            <div class="card-head"><h2>Start over</h2></div>
            <p class="muted" style="margin-top:0;font-size:.9rem">Removes everything recorded in this browser for ${esc(season.label)} and returns to the imported workbook state (${fmt(season.played - state.recorded.length)} games). This cannot be undone, so back up first.</p>
            <button class="btn ghost" id="discardBtn" type="button" ${state.recorded.length ? "" : "disabled"}>Discard ${state.recorded.length} recorded game${state.recorded.length === 1 ? "" : "s"}</button>
          </div>`}
          <div class="card">
            <div class="card-head"><h2>How a game is played</h2></div>
            <p class="muted" style="margin:0;font-size:.9rem">Each game is one roll of the v9 engine (a single game, never thousands) from each team's current inputs (a blend of its season-start line and its own results, fully its own after 10 games). The host opens with the ball, home court is worth about 3 points, and overtime plays on a continuous clock. After a day, every rating is re-solved from all results.</p>
          </div>
        </div>
      </div>
      <dialog id="boxDlg"><div id="boxBody"></div><div class="btn-row" style="margin-top:14px"><button class="btn ghost" id="boxClose" type="button">Close</button></div></dialog>`;

    const status = document.getElementById("status"), bstatus = document.getElementById("bstatus");
    const persist = async () => { await saveOverlay(season.id, toOverlay(state, state.extraGames || [])); };
    const busy = (on, msg) => { for (const id of ["playDay", "playOne", "undoOne", "undoDay"]) { const b = document.getElementById(id); if (b) b.disabled = on; } if (status) status.textContent = msg || ""; };

    document.getElementById("predOn")?.addEventListener("change", (e) => { try { localStorage.setItem("hw-pred-on", e.target.checked ? "1" : "0"); } catch { /* ignore */ } });
    const simsBox = document.getElementById("cbSims");
    if (simsBox) combobox(simsBox, { id: "predSims", value: String(predSims()), searchable: false, options: [1000, 2000, 3000, 5000, 10000, 40000].map((n) => ({ value: String(n), label: n.toLocaleString() + (n === 40000 ? " (backtest standard, slow)" : "") })), onChange: (v) => { try { localStorage.setItem("hw-pred-sims", v); } catch { /* ignore */ } } });
    document.getElementById("lockField")?.addEventListener("click", async () => {
      const c = calc(state), B = core.data.bracketology || { settings: {} }, S = { q1Rank: 25, q2Rank: 50, badLossRank: 100, winWeight: 8, q1Pts: 1.5, q2Pts: 0.75, badLossPts: 1.5, atLarge: 37, seedBump: 2, ...B.settings };
      const tm = teams.map((t) => ({ id: t.id, conf: t.conf, rating: t.rating, eff: t.eff }));
      const rows = computeBoard({ teams: tm, games: state.games, throughDay: 47, picks: [], commAdj: [], settings: S }).rows;
      const champs = new Map(state.games.filter((g) => g.type === "CT" && g.day === 47).map((g) => [g.ctx, g.ptsA > g.ptsB ? g.a : g.b]));
      const picks = suggestField(rows, S.atLarge, champs), v = validateField(picks);
      if (v.errors.length) { document.getElementById("status").textContent = "Could not build a valid field: " + v.errors[0]; return; }
      setContent(state, "field", picks.filter((p) => p.group === "Field").map((p) => ({ team: p.team, seed: p.seed, region: p.region, ff: p.ff })));
      syncTournament(state); await persist(); await render();
      const st2 = document.getElementById("status"); if (st2) st2.textContent = "NCAA field set. First Four is day 48.";
    });
    document.getElementById("playDay")?.addEventListener("click", async () => {
      busy(true, `Playing day ${nextDay}…`);
      await new Promise((r) => setTimeout(r, 20));
      try {
        if (predOn()) {
          const st = document.getElementById("status");
          const k = await lockDay(state, nextDay, { n: predSims(), onProgress: (d, t) => { if (st) st.textContent = `Locking predictions ${d} of ${t} (${predSims().toLocaleString()} sims each)…`; } });
          if (k) await persist();
          if (st) st.textContent = `Playing day ${nextDay}…`;
          await new Promise((r) => setTimeout(r, 20));
        }
        const res = playDay(state, nextDay, seed()); await persist();
        last = { title: `Day ${nextDay} results`, rows: res };
        await render();
        const st_ = document.getElementById("status"); if (st_) st_.textContent = `Day ${nextDay} recorded and saved. Ratings re-solved.`;
      } catch (e) { busy(false, "Could not play: " + e.message); }
    });
    document.getElementById("playOne")?.addEventListener("click", async () => {
      busy(true, "Rolling…");
      try {
        const g = nextUnplayed(state);
        if (predOn() && !state.predictions.has(g.id)) lockPrediction(state, g.id, { n: predSims() });
        const r = rollAndRecord(state, g.id, seed()); await persist();
        last = { title: "Last game", rows: [{ id: g.id, a: g.a, b: g.b, ptsA: r.ptsA, ptsB: r.ptsB, ot: r.ot }] };
        await render();
        document.getElementById("status").textContent = "Game recorded and saved.";
      } catch (e) { busy(false, "Could not play: " + e.message); }
    });
    document.getElementById("undoOne")?.addEventListener("click", async () => {
      const id = state.recorded[state.recorded.length - 1], g = games.find((x) => x.id === id);
      if (!confirm(`Undo ${teams[g.a].name} ${g.ptsA}, ${teams[g.b].name} ${g.ptsB}? The game goes back to unplayed.`)) return;
      undoLast(state, 1); await persist(); last = null; await render();
    });
    document.getElementById("undoDay")?.addEventListener("click", async () => {
      const lastDay = games.find((x) => x.id === state.recorded[state.recorded.length - 1]).day;
      const n = state.recorded.filter((id) => games.find((x) => x.id === id).day === lastDay).length;
      if (!confirm(`Undo all ${n} games recorded for day ${lastDay}? They go back to unplayed.`)) return;
      undoLast(state, n); await persist(); last = null; await render();
    });
    document.getElementById("exportBtn").addEventListener("click", async () => {
      const data = await exportAll(), blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `hardwood-sim-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
      await render(); document.getElementById("bstatus").textContent = "Backup downloaded.";
    });
    document.getElementById("importFile").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text()); const seasons = Object.keys(obj.overlays || {});
        if (!confirm(`Restore ${seasons.join(", ")} from this backup? It replaces what is recorded in this browser for those seasons.`)) return;
        await importAll(obj); await render(); document.getElementById("bstatus").textContent = `Restored ${seasons.join(", ")}.`;
      } catch (err) { bstatus.textContent = "Could not restore: " + err.message; }
    });
    document.getElementById("discardBtn")?.addEventListener("click", async () => {
      if (!confirm(`Discard all ${state.recorded.length} games recorded in this browser for ${season.label}? This cannot be undone.`)) return;
      await clearOverlay(season.id); last = null; await render();
    });

    // box score dialog
    const dlg = document.getElementById("boxDlg");
    document.getElementById("boxClose").onclick = () => dlg.close();
    view.querySelectorAll("tr.clickable").forEach((tr) => tr.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const id = +tr.dataset.id, g = games.find((x) => x.id === id), bx = state.box.get(id);
      if (!bx) return;
      const side = (o, t, pts) => ({ t, pts, FGM: bx[o], FGA: bx[o + 1], TPM: bx[o + 2], TPA: bx[o + 3], FTM: bx[o + 4], FTA: bx[o + 5], OR: bx[o + 6], DR: bx[o + 7], TO: bx[o + 8], ST: bx[o + 9], POSS: bx[o + 10] });
      const A = side(2, teams[g.a], g.ptsA), B = side(13, teams[g.b], g.ptsB);
      const pct = (m, a) => (a ? ((m / a) * 100).toFixed(1) + "%" : "—");
      const rows = [["Points", A.pts, B.pts], ["FG", `${A.FGM}-${A.FGA} (${pct(A.FGM, A.FGA)})`, `${B.FGM}-${B.FGA} (${pct(B.FGM, B.FGA)})`], ["3-point", `${A.TPM}-${A.TPA} (${pct(A.TPM, A.TPA)})`, `${B.TPM}-${B.TPA} (${pct(B.TPM, B.TPA)})`],
        ["Free throws", `${A.FTM}-${A.FTA} (${pct(A.FTM, A.FTA)})`, `${B.FTM}-${B.FTA} (${pct(B.FTM, B.FTA)})`], ["Rebounds", `${A.OR + A.DR} (${A.OR} off)`, `${B.OR + B.DR} (${B.OR} off)`], ["Turnovers", A.TO, B.TO], ["Steals", A.ST, B.ST], ["Possessions", A.POSS.toFixed(1), B.POSS.toFixed(1)]];
      document.getElementById("boxBody").innerHTML = `<h2 style="margin-bottom:4px">Day ${g.day}${bx[1] ? ` &middot; ${bx[1] > 1 ? bx[1] : ""}OT` : ""}</h2><p class="muted" style="margin:0 0 12px">${g.home ? esc(B.t.name) + " hosts" : "Neutral site"}</p>
        <table><thead><tr><th></th><th class="r">${esc(A.t.name)}</th><th class="r">${esc(B.t.name)}</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="muted">${r[0]}</td><td class="r num">${r[1]}</td><td class="r num">${r[2]}</td></tr>`).join("")}</tbody></table>`;
      dlg.showModal();
    }));

    if (document.getElementById("gameDesk")) gameDesk();

    // ------------------------------------------------------------------------------------------------ Game desk
    // The workbook's Game page + LoadNextGame / F9 / RecordAndLoadNext: the next scheduled game is loaded with its teams
    // and site, rolled ONCE by the engine and shown. Re-roll as often as you like; "Log and load next" records exactly
    // the game on screen and loads the next one. No typing team names.
    function gameDesk() {
      const box = document.getElementById("gameDesk");
      let cur = null, logged = 0, busyNow = false, prev = null;
      const pct = (m, a) => (a ? Math.round((m / a) * 100) + "%" : "—");
      function load(id) {
        const g = id != null ? state.byId.get(id) : nextUnplayed(state);
        if (!g) { cur = null; return draw(); }
        if (g.ptsA != null) { cur = { err: `Game ${id} is already recorded.` }; return draw(); }
        let pred = state.predictions.get(g.id) || null;
        if (!pred && predOn()) { try { pred = lockPrediction(state, g.id, { n: predSims() }); } catch { pred = null; } }
        cur = { g, pred, rolls: 0 };
        roll();
      }
      function roll() {
        cur.r = rollGame(state, cur.g.id, seed());      // ONE game, one engine run
        cur.rolls++;
        draw();
      }
      function draw() {
        if (!cur) { box.innerHTML = `<div class="card-head"><h2>Game</h2></div><p class="muted" style="margin:0">No game to load right now.</p>`; return; }
        if (cur.err) { box.innerHTML = `<div class="card-head"><h2>Game</h2></div><p class="down">${esc(cur.err)}</p><div class="btn-row"><button class="btn" id="gdNext" type="button">Load next game</button></div>`; box.querySelector("#gdNext").onclick = () => load(); return; }
        const { g, r, pred } = cur, A = teams[g.a], B = teams[g.b], aw = r.ptsA > r.ptsB;
        const ctx = g.type === "NCAA" ? g.ctx : g.type === "CT" ? `${g.ctx} tournament` : g.type === "Conf" ? "Conference" : "Non-conference";
        const line = (t, pts, bx, win) => `<div class="gd-team ${win ? "win" : ""}">${badge(t, 40)}<div><b>${esc(t.name)}</b><span class="muted">${t.w}-${t.l} &middot; #${t.rank}</span></div><span class="gd-pts">${pts}</span></div>`;
        const st = (k1, k2, bx) => `${bx[k1]}-${bx[k2]}`;
        box.innerHTML = `
          <div class="card-head"><h2>Game ${g.id}</h2><span class="muted">Day ${g.day} &middot; ${esc(ctx)} &middot; ${g.home ? `at ${esc(B.name)}` : "neutral site"}</span></div>
          <div class="gd-score">${line(A, r.ptsA, r.boxA, aw)}${line(B, r.ptsB, r.boxB, !aw)}</div>
          <p class="muted" style="margin:10px 0 0;font-size:.88rem">${r.ot ? `<span class="pill">${r.ot > 1 ? r.ot : ""}OT</span> ` : ""}FG ${st("FGM", "FGA", r.boxA)} / ${st("FGM", "FGA", r.boxB)} &middot; 3P ${st("TPM", "TPA", r.boxA)} / ${st("TPM", "TPA", r.boxB)} &middot; FT ${st("FTM", "FTA", r.boxA)} / ${st("FTM", "FTA", r.boxB)} &middot; REB ${r.boxA.OR + r.boxA.DR} / ${r.boxB.OR + r.boxB.DR} &middot; TO ${r.boxA.TO} / ${r.boxB.TO}</p>
          ${pred ? `<p class="faint" style="margin:6px 0 0;font-size:.82rem">Locked prediction (${pred.sims.toLocaleString()} sims, separate from this game): ${esc(A.name)} ${pct(pred.pA * 1000, 1000)}, margin ${pred.margin >= 0 ? "+" : ""}${pred.margin.toFixed(1)}. This game is a single roll${cur.rolls > 1 ? `, rolled ${cur.rolls} times` : ""}.</p>` : `<p class="faint" style="margin:6px 0 0;font-size:.82rem">This game is a single roll of the engine${cur.rolls > 1 ? ` (rolled ${cur.rolls} times)` : ""}.</p>`}
          <div class="btn-row" style="margin-top:14px">
            <button class="btn" id="gdLog" type="button" title="Enter">Log and load next</button>
            <button class="btn ghost" id="gdRoll" type="button" title="R or F9">Re-roll</button>
            <button class="btn ghost" id="gdLogOnly" type="button">Log this game only</button>
            <span style="display:inline-flex;gap:6px;align-items:center"><input type="number" id="gdId" placeholder="Game #" style="width:110px" aria-label="Game number"><button class="btn ghost" id="gdLoad" type="button">Load</button></span>
          </div>
          <p class="status" id="gdStatus" aria-live="polite">${prev ? `Logged game ${prev.id}: <span id="gdPrev">${esc(teams[prev.a].name)} ${prev.ptsA}, ${esc(teams[prev.b].name)} ${prev.ptsB}</span>${prev.ot ? " (OT)" : ""} &middot; ${logged} this session.` : "Enter = log and load next, R = re-roll."}</p>`;
        box.querySelector("#gdRoll").onclick = () => !busyNow && roll();
        box.querySelector("#gdLog").onclick = () => log(true);
        box.querySelector("#gdLogOnly").onclick = () => log(false);
        box.querySelector("#gdLoad").onclick = () => { const v = parseInt(box.querySelector("#gdId").value, 10); if (v) load(v); };
      }
      async function log(next) {
        if (busyNow || !cur || !cur.r) return;
        busyNow = true;
        try {
          const { g, r } = cur, wasDay = g.day;
          recordRolled(state, g.id, r);
          await persist();
          logged++; prev = { id: g.id, a: g.a, b: g.b, ptsA: r.ptsA, ptsB: r.ptsB, ot: r.ot };
          last = { title: "Logged on the Game desk", rows: [{ id: g.id, a: g.a, b: g.b, ptsA: r.ptsA, ptsB: r.ptsB, ot: r.ot }, ...((last && last.title === "Logged on the Game desk") ? last.rows : [])].slice(0, 25) };
          const kp = document.getElementById("kPlayed"); if (kp) kp.textContent = fmt(state.games.filter((x) => x.ptsA != null).length);
          const kt = document.getElementById("kTotal"); if (kt) kt.textContent = `of ${fmt(state.games.length)}`;
          const nx = nextUnplayed(state);
          // a finished day, a new tournament round or the end of the season changes the rest of the page: redraw it all
          if (!next || !nx || nx.day !== wasDay) { busyNow = false; await render(); return; }
          load();
        } catch (e) { const s = box.querySelector("#gdStatus"); if (s) s.textContent = "Could not log: " + e.message; }
        busyNow = false;
      }
      document.onkeydown = (e) => {
        if (!document.getElementById("gameDesk") || e.target.closest("input, textarea, [role=combobox]") || document.querySelector("dialog[open]")) return;
        if (e.key === "Enter") { e.preventDefault(); log(true); }
        else if (e.key === "r" || e.key === "R" || e.key === "F9") { e.preventDefault(); if (cur && cur.g && !busyNow) roll(); }
      };
      load();
    }
  }
})();
