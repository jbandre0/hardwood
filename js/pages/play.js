import { shell, fail } from "../ui.js";
import { combobox } from "../combobox.js";
import { loadCore, resetCores, esc, badge, teamLink, signed, apTag, apName } from "../data.js";
import { engineVersion, rollAndRecord, rollGame, recordRolled, playDay, undoLast, toOverlay, nextUnplayed, calc, setContent, syncTournament } from "../league/league.js";
import { computeBoard } from "../league/bracketology.js";
import { suggestField, validateField } from "../league/field.js";
import { lockDay, lockPrediction, DEFAULT_SIMS } from "../league/predictions.js";
import { dayDone } from "../league/recap.js";
import { downloadSeasonExport } from "../export-download.js";
import { startWatch } from "../watch-view.js";
import { folderSupported, pickFolder, forgetFolder, savedFolder, folderPermission, backupToFolder, autoBackup, lastBackup } from "../folder-backup.js";
import { saveOverlay, clearOverlay, exportAll, importAll, loadOverlay, unsavedSince, protectStorage, leagueModeNow } from "../league/store.js";

const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const predOn = () => { try { return localStorage.getItem("hw-pred-on") !== "0"; } catch { return true; } };
const predSims = () => { try { return +localStorage.getItem("hw-pred-sims") || DEFAULT_SIMS; } catch { return DEFAULT_SIMS; } };
const fmt = (n) => n.toLocaleString();
// One seed per game until it is logged: Play game, Watch game and "leave and come back" are all the same game.
const pendKey = (sid) => `hw-pending-${sid}`;
const pendingSeed = (sid, gid) => {
  try { const p = JSON.parse(localStorage.getItem(pendKey(sid)) || "null"); if (p && p.id === gid) return p.seed; } catch { /* ignore */ }
  const sd = seed(); try { localStorage.setItem(pendKey(sid), JSON.stringify({ id: gid, seed: sd })); } catch { /* ignore */ }
  return sd;
};
const clearPending = (sid) => { try { localStorage.removeItem(pendKey(sid)); } catch { /* ignore */ } };

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

      ${state.staleOverlay ? `<div class="card" style="margin-bottom:18px;border-color:var(--warm)">
        <div class="card-head"><h2>Older saved data set aside</h2></div>
        <p style="margin-top:0">This browser has ${state.staleOverlay.games} game${state.staleOverlay.games === 1 ? "" : "s"}${state.staleOverlay.content.length ? ` and ${esc(state.staleOverlay.content.join(", "))}` : ""} saved against an older import of ${esc(season.label)}. ${esc(season.label)} now comes from the latest workbook, so that data is not being used. Nothing has been deleted.</p>
        <div class="btn-row"><button class="btn ghost" id="staleDl" type="button">Download it first</button><button class="btn" id="staleDrop" type="button">Discard it and start fresh</button></div></div>` : ""}
      <div class="grid cols-main">
        <div class="stack">
          <div class="card">
            <div class="kpis">
              <div class="kpi"><small>Games played</small><b id="kPlayed">${fmt(season.played)}</b><span id="kTotal">of ${fmt(season.total)}</span></div>
              <div class="kpi"><small>Latest day</small><b>${season.day}</b><span>${season.day > 42 ? "of 54 (postseason)" : "of 42 regular-season days"}</span></div>
              <div class="kpi"><small>Next day</small><b>${nextDay ?? "—"}</b><span>${dayGames.length} games${season.day ? ` &middot; <a href="recap.html?day=${season.day}" style="color:var(--accent)">day ${season.day} recap</a>` : ""}</span></div>
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

          ${dayGames.length ? `<div class="card plain" id="dayPreview"><div class="card-head"><h2>Day ${nextDay} preview</h2><span class="muted"><span id="dpLeft">${dayGames.length}</span> games left, in playing order</span></div>
            <div class="table-wrap"><table><thead><tr><th class="r">Game</th><th>Visitor</th><th>Host</th><th>Site</th><th class="r">Favorite</th></tr></thead><tbody>
              ${dayGames.map((g) => { const f = fav(g); return `<tr data-gid="${g.id}"><td class="r num muted">${g.id}</td><td>${teamLink(teams[g.a])}</td><td>${teamLink(teams[g.b])}</td><td class="muted">${g.home ? "Host" : "Neutral"}</td><td class="r"><span class="muted">${esc(f[0].name)}</span> <b class="num">+${f[1].toFixed(1)}</b></td></tr>`; }).join("")}
            </tbody></table></div></div>` : ""}

          ${mine.length ? `<div class="card plain"><div class="card-head"><h2>Recorded on this site</h2><span class="muted">latest ${mine.length} of ${state.recorded.length}</span></div>
            <div class="table-wrap"><table><thead><tr><th>Day</th><th>Visitor</th><th class="r">Pts</th><th>Host</th><th class="r">Pts</th><th></th></tr></thead><tbody>
              ${mine.map((id) => { const g = games.find((x) => x.id === id); const a = teams[g.a], b = teams[g.b], bx = state.box.get(id); const aw = g.ptsA > g.ptsB;
                return `<tr data-id="${id}" class="clickable"><td class="muted num">${g.day}</td><td>${teamLink(a)}</td><td class="r num ${aw ? "w" : "muted"}">${g.ptsA}</td><td>${teamLink(b)}</td><td class="r num ${aw ? "muted" : "w"}">${g.ptsB}</td><td>${bx[1] ? `<span class="pill">${bx[1] > 1 ? bx[1] : ""}OT</span>` : ""}</td></tr>`; }).join("")}
            </tbody></table></div></div>` : ""}
        </div>

        <div class="stack">
          ${season.day >= 54 || complete ? `<div class="card"><div class="card-head"><h2>Offseason</h2></div><p class="muted" style="margin-top:0">Awards, the tier review and creating next season.</p><a class="btn" href="offseason.html">Open the offseason</a></div>` : ""}
          ${complete ? "" : `<div class="card" id="engineCard">
            <div class="card-head"><h2>Engine</h2><span class="muted">${engineVersion(state) === "v10" ? "v10, realism ceiling" : "v9, original"}</span></div>
            <p class="muted" style="margin-top:0;font-size:.88rem">v10 plays like v9 but holds runaway teams to what a real team could do (rated 34 at most, stats no more than ~4% past the best real team) and caps anyone's chance of beating anyone at 99%. Each logged game records which engine played it, and predictions are scored separately per engine.</p>
            <div class="seg" id="engineSeg" role="group" aria-label="Engine version"><button type="button" data-v="v10" class="${engineVersion(state) === "v10" ? "on" : ""}">v10</button><button type="button" data-v="v9" class="${engineVersion(state) === "v9" ? "on" : ""}">v9</button></div></div>`}
          ${complete ? "" : `<div class="card">
            <div class="card-head"><h2>Predictions</h2><a href="predictions.html">Scorecard</a></div>
            <p class="muted" style="margin-top:0;font-size:.9rem">Before a game is played, the engine's prediction is locked and later scored. ${state.predictions.size.toLocaleString()} locked so far.</p>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><input type="checkbox" id="predOn" ${predOn() ? "checked" : ""}> Lock predictions before playing</label>
            <div class="field"><label for="predSims">Simulations per prediction</label><div id="cbSims"></div></div>
            <p class="faint" style="margin:8px 0 0;font-size:.8rem">More simulations = steadier numbers, slower days. 3,000 takes about 5-10 seconds a day.</p></div>`}
          ${folderSupported() ? `<div class="card" id="folderCard"><div class="card-head"><h2>Automatic backup folder</h2></div><div id="folderBody" class="muted" style="font-size:.9rem">Checking…</div></div>` : ""}
          <div class="card">
            <div class="card-head"><h2>Backup</h2></div>
            <p class="${unsaved ? "" : "muted"}" style="margin-top:0">${unsaved ? `<b style="color:var(--warm)">${unsaved} game${unsaved === 1 ? "" : "s"} recorded since your last backup.</b>` : state.recorded.length ? "Everything recorded here is in your last backup." : "Nothing recorded on this site yet."}</p>
            <p style="font-size:.9rem;margin:0 0 8px" id="storageState"></p>
            <p class="muted" style="font-size:.9rem">Games are saved in this browser only. A backup file holds everything for every season. Clearing site data or switching browsers would lose it, so download a backup after each session.</p>
            <div class="btn-row"><button class="btn" id="exportBtn" type="button">Download backup</button><label class="btn ghost" for="importFile" style="cursor:pointer">Restore from backup</label><input id="importFile" type="file" accept="application/json,.json" hidden></div>
            <p class="muted" style="font-size:.88rem;margin:10px 0 0" id="repoBackup"></p>
            <p class="status" id="bstatus" aria-live="polite"></p>
            <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
            <p class="muted" style="margin:0 0 10px;font-size:.9rem">Bracketology week: download the season so far (with a full backup inside) and attach it when you ask Claude to "do bracketology". The session saves the backup to GitHub too.</p>
            <button class="btn ghost" id="exportBk" type="button">Export for bracketology</button>
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

    protectStorage().then((st) => { const el = document.getElementById("storageState"); if (el) el.innerHTML = st === "protected" ? '<span class="up">Storage is protected</span> <span class="muted">(the browser won\'t clear it on its own)</span>' : st === "not-protected" ? '<span class="down">Storage is not protected</span> <span class="muted">(the browser may clear it if it runs low on space; bookmark the site and back up often)</span>' : '<span class="muted">This browser can\'t protect storage; back up often.</span>'; });
    // ---- automatic backups to a folder on this computer
    async function folderUI() {
      const body = document.getElementById("folderBody"); if (!body) return;
      const h = await savedFolder(), perm = await folderPermission(h, false), last = lastBackup();
      const when = last ? `Last saved ${new Date(last.at).toLocaleString()} (${last.name}).` : "Nothing saved yet.";
      if (!h) body.innerHTML = `<p style="margin:0 0 10px">Pick a folder on this computer (Documents is fine). After every finished day the site saves a full backup there, so clearing the browser's data can never cost you more than a day.</p><button class="btn" id="fPick" type="button">Choose a backup folder</button>`;
      else if (perm === "granted") body.innerHTML = `<p style="margin:0 0 6px"><span class="up">Saving to <b>${esc(h.name)}</b></span> after every finished day.</p><p style="margin:0 0 10px">${esc(when)}</p><div class="btn-row"><button class="btn ghost" id="fNow" type="button">Back up now</button><button class="btn ghost" id="fPick" type="button">Change folder</button><button class="btn ghost" id="fStop" type="button">Stop</button></div>`;
      else body.innerHTML = `<p style="margin:0 0 10px"><span class="down">Chrome needs your OK to write to <b>${esc(h.name)}</b> again.</span> It asks once per visit unless you choose "Allow on every visit".</p><div class="btn-row"><button class="btn" id="fAllow" type="button">Reconnect the folder</button><button class="btn ghost" id="fPick" type="button">Change folder</button></div>`;
      const st = (m) => { body.querySelector(".fstatus")?.remove(); const p = document.createElement("p"); p.className = "status fstatus"; p.textContent = m; body.appendChild(p); };
      const run = async (handle) => { try { const i = await backupToFolder(handle, { season: season.id, day: season.day }); await folderUI(); st(`Saved ${i.name} (${(i.bytes / 1e6).toFixed(1)} MB).`); } catch (e) { st("Could not save: " + e.message); } };
      body.querySelector("#fPick")?.addEventListener("click", async () => { try { const nh = await pickFolder(); if ((await folderPermission(nh, true)) === "granted") await run(nh); else await folderUI(); } catch (e) { if (e.name !== "AbortError") st("Could not use that folder: " + e.message); } });
      body.querySelector("#fAllow")?.addEventListener("click", async () => { if ((await folderPermission(h, true)) === "granted") await run(h); else st("Permission was not granted."); });
      body.querySelector("#fNow")?.addEventListener("click", () => run(h));
      body.querySelector("#fStop")?.addEventListener("click", async () => { if (confirm("Stop saving backups to this folder? Files already there stay.")) { await forgetFolder(); await folderUI(); } });
    }
    if (folderSupported()) {
      folderUI();
      // also save when the desk opens if the last backup is more than an hour old
      const lb = lastBackup(); if (!lb || Date.now() - new Date(lb.at).getTime() > 3600e3) autoBackup({ season: season.id, day: season.day }).then((i) => { if (i) folderUI(); });
    }
    // weekly backup saved to GitHub by the bracketology session (data/backups/latest.json)
    // (the commissioner's league only: a visitor's own league must never pull the commissioner's games in)
    if (leagueModeNow() === "main") fetch("data/backups/latest.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((B) => {
      const el = document.getElementById("repoBackup"); if (!el || !B || B.none || !B.overlays) return;
      const mine = state.recorded.length, theirs = (B.counts || {})[season.id] ?? 0;
      el.innerHTML = `Weekly backup on GitHub: ${esc(B.from.label)} through day ${B.from.throughDay}, saved ${new Date(B.savedToRepoAt).toLocaleDateString()}. <button class="btn ghost" id="restoreRepo" type="button" style="padding:4px 10px;font-size:.82rem">Restore it</button>`;
      document.getElementById("restoreRepo").onclick = async () => {
        const warn = mine > theirs ? `\n\nCareful: this browser has ${mine} games recorded for ${season.label}, the GitHub backup only ${theirs}. Restoring loses the ${mine - theirs} newer games.` : "";
        if (!confirm(`Replace what's saved in this browser with the GitHub backup (through day ${B.from.throughDay})?${warn}`)) return;
        await importAll(B); resetCores(); await render(); const b = document.getElementById("bstatus"); if (b) b.textContent = "Restored the weekly GitHub backup.";
      };
    }).catch(() => {});
    document.getElementById("exportBk")?.addEventListener("click", async () => { await downloadSeasonExport(core); await render(); const b = document.getElementById("bstatus"); if (b) b.textContent = "Export downloaded (it includes a full backup)."; });
    document.getElementById("staleDl")?.addEventListener("click", async () => { const blob = new Blob([JSON.stringify(await exportAll())], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hardwood-old-${season.id}-data.json`; a.click(); });
    document.getElementById("staleDrop")?.addEventListener("click", async () => { if (!confirm(`Discard the older ${season.label} data saved in this browser? The imported season is not affected.`)) return; await clearOverlay(season.id); last = null; await render(); });
    document.querySelectorAll("#engineSeg button").forEach((b) => b.addEventListener("click", async () => { if (b.dataset.v === engineVersion(state)) return; setContent(state, "engine", b.dataset.v); await persist(); clearPending(season.id); await render(); const f = document.querySelector(".rail-foot"); if (f) f.innerHTML = `Engine ${b.dataset.v} &middot; 40,000 sims per matchup`; }));
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
      const st2 = document.getElementById("status"); if (st2) st2.innerHTML = 'NCAA field set. First Four is day 48. <a href="challenge.html" style="color:var(--accent)">The bracket challenge is open</a>: fill yours in before the round of 64 (day 49) is played.';
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
        location.href = `recap.html?day=${nextDay}`; return;
        const st_ = document.getElementById("status"); if (st_) st_.textContent = `Day ${nextDay} recorded and saved. Ratings re-solved.`;
      } catch (e) { busy(false, "Could not play: " + e.message); }
    });
    document.getElementById("playOne")?.addEventListener("click", async () => {
      busy(true, "Rolling…");
      try {
        const g = nextUnplayed(state);
        if (predOn() && !state.predictions.has(g.id)) lockPrediction(state, g.id, { n: predSims() });
        const r = rollAndRecord(state, g.id, seed()); await persist();
        if (dayDone(state, g.day)) { location.href = `recap.html?day=${g.day}`; return; }
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
        const from = obj.league || "main", here = leagueModeNow();
        const whose = (m) => (m === "mine" ? "someone's own league" : "the commissioner's league");
        const cross = from !== here ? `\n\nHeads up: this backup is from ${whose(from)}, and you're in ${whose(here)}. It will be restored into ${whose(here)}.` : "";
        if (!confirm(`Restore ${seasons.join(", ")} from this backup? It replaces what is recorded in this browser for those seasons.${cross}`)) return;
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
    // The workbook's Game page, step by step: "Load next game" puts the next scheduled game on screen (teams, records,
    // site, prediction) without playing it; "Play game" rolls it ONCE and logs it to the season right away; then load
    // the next one. Enter does the next step. No typing team names.
    function gameDesk() {
      const box = document.getElementById("gameDesk");
      let cur = null, logged = 0, busyNow = false;
      const pc = (p) => `${Math.round(p * 100)}%`;
      function load(id) {
        const g = id != null ? state.byId.get(id) : nextUnplayed(state);
        if (!g) { cur = null; return draw(); }
        if (g.ptsA != null) { cur = { err: `Game ${id} has already been played.` }; return draw(); }
        if (g.a == null || g.b == null) { cur = { err: `Game ${id}'s teams aren't known yet.` }; return draw(); }
        let pred = state.predictions.get(g.id) || null;
        if (!pred && predOn()) { try { pred = lockPrediction(state, g.id, { n: predSims() }); } catch { pred = null; } }
        cur = { g, pred, r: null };
        draw();
      }
      // live team line from the state (records move as games are logged)
      const lineOf = (id) => {
        const s = calc(state).teams[id].stats, t = teams[id];
        const form = s.last10 || "";
        return { t, rec: `${s.W}-${s.L}`, conf: `${s.confW}-${s.confL}`, rank: s.rank, rating: s.GP ? s.rating : s.tierRating, streak: s.streak || "", form, home: s.home, away: s.away };
      };
      function syncPreview() {
        const tb = document.querySelector("#dayPreview tbody"); if (!tb) return;
        tb.querySelectorAll("tr[data-gid]").forEach((tr) => { const g = state.byId.get(+tr.dataset.gid); if (!g || g.ptsA != null) tr.remove(); else tr.classList.toggle("on-deck", !!(cur && cur.g && cur.g.id === g.id && !cur.r)); });
        const left = document.getElementById("dpLeft"); if (left) left.textContent = tb.querySelectorAll("tr[data-gid]").length;
      }
      function draw() {
        syncPreview();
        if (!cur) { box.innerHTML = `<div class="card-head"><h2>Game desk</h2></div><p class="muted" style="margin:0">No game to load right now.</p>`; return; }
        if (cur.err) { box.innerHTML = `<div class="card-head"><h2>Game desk</h2></div><p class="down">${esc(cur.err)}</p><div class="btn-row"><button class="btn" id="gdNext" type="button">Load next game</button></div>`; box.querySelector("#gdNext").onclick = () => load(); return; }
        const { g, r, pred } = cur, A = lineOf(g.a), B = lineOf(g.b);
        const ctx = g.type === "NCAA" ? g.ctx : g.type === "CT" ? `${g.ctx} tournament` : g.type === "Conf" ? `${teams[g.a].conf} conference game` : "Non-conference";
        const played = !!r, aw = played && r.ptsA > r.ptsB;
        const side = (L, pts, win, isHost) => `<div class="gd-team ${played && win ? "win" : ""}">${badge(L.t, 40)}
          <div><b>${apTag(L.t)}${esc(L.t.name)}${isHost ? ' <span class="faint" style="font-weight:500">(home)</span>' : ""}</b><span class="muted">${L.rec} &middot; ${L.conf} conf &middot; ${L.rank ? "#" + L.rank : "unranked"} &middot; rating ${L.rating.toFixed(1)}${L.streak ? " &middot; " + L.streak : ""}${L.form ? " &middot; last 10 " + L.form : ""}</span></div>
          <span class="gd-pts">${played ? pts : ""}</span></div>`;
        const st = (k1, k2, bx) => `${bx[k1]}-${bx[k2]}`;
        box.innerHTML = `
          <div class="card-head"><h2>Game ${g.id}</h2><span class="muted">Day ${g.day} &middot; ${esc(ctx)} &middot; ${g.home ? `at ${esc(apName(teams[g.b]))}` : "neutral site"}</span></div>
          <div class="gd-score">${side(A, played && r.ptsA, aw, false)}${side(B, played && r.ptsB, !aw, g.home !== 0)}</div>
          ${played ? `<p class="muted" style="margin:10px 0 0;font-size:.88rem"><b class="${"up"}">Final${r.ot ? ` (${r.ot > 1 ? r.ot : ""}OT)` : ""}, logged to the season.</b> FG ${st("FGM", "FGA", r.boxA)} / ${st("FGM", "FGA", r.boxB)} &middot; 3P ${st("TPM", "TPA", r.boxA)} / ${st("TPM", "TPA", r.boxB)} &middot; FT ${st("FTM", "FTA", r.boxA)} / ${st("FTM", "FTA", r.boxB)} &middot; REB ${r.boxA.OR + r.boxA.DR} / ${r.boxB.OR + r.boxB.DR} &middot; TO ${r.boxA.TO} / ${r.boxB.TO}</p>` : ""}
          ${pred ? `<p class="faint" style="margin:8px 0 0;font-size:.82rem">Prediction locked before tip-off (${pred.sims.toLocaleString()} sims, kept separate from the game): ${esc(apName(teams[g.a]))} ${pc(pred.pA)}, ${esc(apName(teams[g.b]))} ${pc(1 - pred.pA)}, expected margin ${pred.margin >= 0 ? "+" : ""}${pred.margin.toFixed(1)} for ${esc(apName(teams[g.a]))}. The game itself is one roll.</p>` : ""}
          <div class="btn-row" style="margin-top:14px">
            ${played && dayDone(state, g.day) ? `<button class="btn warm" id="gdNext" type="button" title="Enter">Day ${g.day} is finished: see the recap</button>` : played ? `<button class="btn" id="gdNext" type="button" title="Enter">Load next game</button>` : `<button class="btn" id="gdPlay" type="button" title="Enter">Play game</button><button class="btn warm" id="gdWatch" type="button" title="W">Watch game</button>`}
            <span style="display:inline-flex;gap:6px;align-items:center"><input type="number" id="gdId" placeholder="Game #" style="width:110px" aria-label="Game number"><button class="btn ghost" id="gdLoad" type="button">Load</button></span>
          </div>
          <p class="status" id="gdStatus" aria-live="polite">${played ? `<span id="gdPrev" hidden>${r.ptsA}-${r.ptsB}</span>` : ""}${logged ? `${logged} played this session. ` : ""}Enter = ${played ? (dayDone(state, g.day) ? "see the day's recap" : "load next game") : "play this game, W = watch it"}.</p>`;
        const pb = box.querySelector("#gdPlay"); if (pb) pb.onclick = play;
        const wb = box.querySelector("#gdWatch"); if (wb) wb.onclick = watch;
        const nb = box.querySelector("#gdNext"); if (nb) nb.onclick = next;
        box.querySelector("#gdLoad").onclick = () => { const v = parseInt(box.querySelector("#gdId").value, 10); if (v) load(v); };
      }
      async function play() {
        if (busyNow || !cur || !cur.g || cur.r) return;
        busyNow = true;
        try {
          const g = cur.g, r = rollGame(state, g.id, pendingSeed(season.id, g.id));   // ONE game, one engine run
          recordRolled(state, g.id, r);                          // logged to the season: results, box score, ratings
          await persist();
          clearPending(season.id); cur.r = r; logged++;
          last = { title: "Played on the Game desk", rows: [{ id: g.id, a: g.a, b: g.b, ptsA: r.ptsA, ptsB: r.ptsB, ot: r.ot }, ...((last && last.title === "Played on the Game desk") ? last.rows : [])].slice(0, 25) };
          const kp = document.getElementById("kPlayed"); if (kp) kp.textContent = fmt(state.games.filter((x) => x.ptsA != null).length);
          const kt = document.getElementById("kTotal"); if (kt) kt.textContent = `of ${fmt(state.games.length)}`;
          draw();
        } catch (e) { const s = box.querySelector("#gdStatus"); if (s) s.textContent = "Could not play: " + e.message; }
        busyNow = false;
      }
      let viewer = null;
      function watch() {
        if (busyNow || !cur || !cur.g || cur.r) return;
        const g = cur.g, A = teams[g.a], B = teams[g.b], sd = pendingSeed(season.id, g.id);
        const r = rollGame(state, g.id, sd, calc(state), { keepLog: true });   // the same single roll Play game would make, with its play log
        const la = lineOf(g.a), lb = lineOf(g.b);
        const ctx = g.type === "NCAA" ? g.ctx : g.type === "CT" ? `${g.ctx} tournament` : g.type === "Conf" ? `${teams[g.a].conf} conference game` : "Non-conference";
        const hfa = state.S.settings.hfa || 3.7;
        busyNow = false;
        viewer = startWatch(box, {
          game: g, A, B, result: r, expMargin: (la.rating - lb.rating) - (g.home ? hfa : 0),
          records: { A: `${la.rec} · ${la.conf} conf · ${la.rank ? "#" + la.rank : "unranked"}`, B: `${lb.rec} · ${lb.conf} conf · ${lb.rank ? "#" + lb.rank : "unranked"}` },
          header: { title: `Game ${g.id}`, sub: `Day ${g.day} · ${ctx} · ${g.home ? "at " + B.name : "neutral site"}` },
          onFinish: async () => {                      // runs once, when the broadcast ends: logged exactly like Play game
            recordRolled(state, g.id, r); await persist(); clearPending(season.id);
            cur.r = r; logged++;
            last = { title: "Played on the Game desk", rows: [{ id: g.id, a: g.a, b: g.b, ptsA: r.ptsA, ptsB: r.ptsB, ot: r.ot }, ...((last && last.title === "Played on the Game desk") ? last.rows : [])].slice(0, 25) };
            const kp = document.getElementById("kPlayed"); if (kp) kp.textContent = fmt(state.games.filter((x) => x.ptsA != null).length);
            const kt = document.getElementById("kTotal"); if (kt) kt.textContent = `of ${fmt(state.games.length)}`;
            syncPreview();
          },
          onNext: () => { if (viewer) viewer.stop(); viewer = null; next(); },
        });
      }
      async function next() {
        if (busyNow) return;
        const wasDay = cur && cur.g ? cur.g.day : null, nx = nextUnplayed(state);
        if (wasDay != null && cur.r && dayDone(state, wasDay)) { location.href = `recap.html?day=${wasDay}`; return; }
        // a finished day, a new tournament round or the end of the season changes the rest of the page: redraw it all
        if (!nx || nx.day !== wasDay) { await render(); return; }
        load();
      }
      document.onkeydown = (e) => {
        if (box.dataset.watching === "1" || (viewer && box.querySelector("#wvFinal"))) return;
        if (document.getElementById("gameDesk") && (e.key === "w" || e.key === "W") && !e.target.closest("input, textarea, button, [role=combobox], a") && !document.querySelector("dialog[open]") && cur && cur.g && !cur.r) { e.preventDefault(); watch(); return; }
        if (!document.getElementById("gameDesk") || e.key !== "Enter" || e.target.closest("input, textarea, button, [role=combobox], a") || document.querySelector("dialog[open]")) return;
        e.preventDefault();
        if (cur && cur.g && !cur.r) play(); else next();
      };
      load();
    }
  }
})();
