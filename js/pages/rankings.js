import { shell, fail } from "../ui.js";
import { combobox } from "../combobox.js";
import { loadCore, resetCores, esc, teamLink, signed, recordAsOf } from "../data.js";
import { setContent, toOverlay } from "../league/league.js";
import { saveOverlay } from "../league/store.js";

(async function main() {
  const view = shell("rankings");
  try {
    const core = await loadCore();
    let tab = location.hash === "#ap" ? "ap" : location.hash === "#poll" ? "poll" : "power";
    let editing = null;   // draft ballot being edited
    const st = { sort: "rank", dir: 1, conf: "", tier: "" };
    let week = Math.max(0, core.polls.length - 1);

    view.innerHTML = `
      <div class="page-title"><span class="kicker">${esc(core.season.label)} ${core.season.status === "complete" ? "final" : "&middot; through day " + core.season.day}</span><h1>Rankings</h1>
        <p>Power ratings come from the sim itself: average margin plus the strength of everyone you played, solved for all 365 teams at once. The AP Top 25 is the committee's weekly poll.</p></div>
      <div class="seg" style="margin-bottom:16px" id="tabs"><button type="button" data-t="power">Power ratings</button><button type="button" data-t="ap">AP Top 25</button><button type="button" data-t="poll">Power Poll</button></div>
      <div class="card plain" id="panel"></div>`;
    const panel = document.getElementById("panel");
    const tabs = document.getElementById("tabs");

    const COLS = [
      ["rank", "#", (t) => t.rank, "c"], ["name", "Team", null], ["conf", "Conf", null], ["tier", "Tier", null],
      ["w", "Record", null, "r"], ["margin", "Margin/G", null, "r"], ["oppRating", "SOS", null, "r"], ["vsTier", "vs tier", null, "r"], ["rating", "Rating", null, "r"],
    ];
    const val = (t, k) => (k === "name" ? t.name : k === "conf" ? t.conf : k === "tier" ? t.tier : k === "w" ? t.w / Math.max(1, t.w + t.l) : k === "vsTier" ? t.rating - t.tierRating : t[k]);

    function power() {
      let rows = core.teams.filter((t) => (!st.conf || t.conf === st.conf) && (!st.tier || t.tier === st.tier));
      rows.sort((a, b) => {
        const x = val(a, st.sort), y = val(b, st.sort);
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * st.dir || a.rank - b.rank;
      });
      const mx = Math.max(...core.teams.map((t) => t.rating)), mn = Math.min(...core.teams.map((t) => t.rating));
      panel.innerHTML = `
        <div class="btn-row" style="margin-bottom:14px">
          <div class="field" style="min-width:200px"><label for="fc">Conference</label><div id="cbConf"></div></div>
          <div class="field" style="min-width:140px"><label for="ft">Tier</label><div id="cbTier"></div></div>
          <div class="field" style="align-self:end"><span class="muted">${rows.length} teams</span></div>
        </div>
        <div class="table-wrap"><table><thead><tr>${COLS.map(([k, label, , al]) => `<th class="sortable ${al || ""} ${st.sort === k ? "sorted" : ""}" data-k="${k}" aria-sort="${st.sort === k ? (st.dir > 0 ? "ascending" : "descending") : "none"}">${label}${st.sort === k ? (st.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody>
          ${rows.map((t) => `<tr><td class="rank c">${t.rank}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td><span class="pill">${esc(t.tier)}</span></td><td class="r num">${t.w}-${t.l}</td><td class="r num ${t.margin >= 0 ? "up" : "down"}">${signed(t.margin)}</td><td class="r num muted">${t.oppRating.toFixed(1)}</td><td class="r num ${t.rating - t.tierRating >= 0 ? "up" : "down"}">${signed(t.rating - t.tierRating)}</td>
            <td class="r"><div class="bar-cell" style="justify-content:flex-end"><i style="width:${Math.max(4, ((t.rating - mn) / (mx - mn)) * 70)}px"></i><span><b>${t.rating.toFixed(1)}</b></span></div></td></tr>`).join("")}
        </tbody></table></div>`;
      combobox(panel.querySelector("#cbConf"), { id: "fc", value: st.conf, placeholder: "Conference", onChange: (v) => { st.conf = v; power(); },
        options: [{ value: "", label: "All conferences" }, ...core.confs.map((c) => ({ value: c, label: c }))] });
      combobox(panel.querySelector("#cbTier"), { id: "ft", value: st.tier, searchable: false, onChange: (v) => { st.tier = v; power(); },
        options: [{ value: "", label: "All tiers" }, ...["S", "A", "B", "C", "D", "F"].map((c) => ({ value: c, label: "Tier " + c }))] });
      panel.querySelectorAll("th.sortable").forEach((th) => th.onclick = () => {
        const k = th.dataset.k;
        if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = ["rank", "name", "conf", "tier"].includes(k) ? 1 : -1; }
        power();
      });
    }

    const { state, season } = core;
    const persist = async () => { await saveOverlay(season.id, toOverlay(state)); resetCores(); };
    const polls = () => state.content.ap;
    const rankMove = (prev, id, r) => { const pr = prev.get(id); return !prev.size ? "" : pr == null ? '<span class="pill warm">NEW</span>' : pr === r ? '<span class="faint">—</span>' : pr > r ? `<span class="up">▲ ${pr - r}</span>` : `<span class="down">▼ ${r - pr}</span>`; };

    function ap() {
      const P = polls();
      if (!P.length) { panel.innerHTML = `<div class="empty"><h3>No ballots yet</h3><p class="muted">Cast the preseason ballot to start the poll.</p><div class="btn-row" style="justify-content:center"><button class="btn" id="newBallot" type="button">Cast preseason ballot</button></div></div>`; wireAp(); return; }
      week = Math.min(week, P.length - 1);
      const p = P[week], prev = week > 0 ? P[week - 1] : null;
      const prevRank = new Map((prev ? prev.ranks : []).map((id, i) => [id, i + 1]));
      const dropped = prev ? prev.ranks.filter((id) => !p.ranks.includes(id)) : [];
      const isLast = week === P.length - 1, live = season.status !== "complete";
      panel.innerHTML = `
        <div class="card-head"><h2>${p.week === 0 ? "Preseason" : "Week " + esc(p.week)}</h2><span class="muted">${p.week === 0 ? "Before day 1" : "Released after day " + p.afterDay}</span></div>
        <div class="poll-tabs" role="tablist" aria-label="Poll week">${P.map((x, i) => `<button type="button" role="tab" class="${i === week ? "on" : ""}" data-i="${i}">${x.week === 0 ? "Pre" : "Wk " + x.week}</button>`).join("")}</div>
        <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th>Conf</th><th class="r">Record</th><th class="c">Move</th><th class="r">Rating</th></tr></thead><tbody>
          ${p.ranks.map((id, i) => { const t = core.teams[id], r = i + 1;
            return `<tr><td class="rank c">${r}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td class="r num">${recordAsOf(core, id, p.afterDay)}</td><td class="c">${rankMove(prevRank, id, r)}</td><td class="r num"><b>${t.rating.toFixed(1)}</b></td></tr>`;
          }).join("")}
        </tbody></table></div>
        ${dropped.length ? `<p class="muted" style="margin:12px 0 0;font-size:.88rem">Dropped out: ${dropped.map((id) => esc(core.teams[id].name)).join(", ")}</p>` : ""}
        <p class="faint" style="margin:12px 0 0;font-size:.82rem">Rating shown is each team's current rating. The poll is the committee's opinion and doesn't feed the simulation.</p>
        ${live ? `<div class="btn-row" style="margin-top:14px"><button class="btn" id="newBallot" type="button">Cast week ${P[P.length - 1].week + 1} ballot</button>${isLast ? `<button class="btn ghost" id="editBallot" type="button">Edit this ballot</button><button class="btn ghost" id="delBallot" type="button">Delete this ballot</button>` : ""}</div>` : ""}`;
      panel.querySelectorAll(".poll-tabs button").forEach((b) => b.onclick = () => { week = +b.dataset.i; ap(); });
      wireAp();
    }
    function suggestBallot() {
      // committee-style suggestion: win% matters as much as rating early, rating matters more as the sample grows
      const score = (t) => (t.gp ? t.rating + 25 * (t.w / t.gp - 0.5) * Math.min(1, t.gp / 8) - 2 * t.l : t.prevRating != null ? 0.4 * t.prevRating + 0.6 * t.tierRating : t.tierRating);
      return [...core.teams].sort((a, b) => score(b) - score(a)).slice(0, 25).map((t) => t.id);
    }
    function wireAp() {
      const P = polls();
      const nb = panel.querySelector("#newBallot");
      if (nb) nb.onclick = () => { const last = P[P.length - 1]; editing = { week: last ? last.week + 1 : 0, afterDay: last ? season.day : 0, ranks: suggestBallot(), isNew: true }; editor(); };
      const eb = panel.querySelector("#editBallot");
      if (eb) eb.onclick = () => { const last = P[P.length - 1]; editing = { ...last, ranks: last.ranks.slice(), isNew: false }; editor(); };
      const db = panel.querySelector("#delBallot");
      if (db) db.onclick = async () => { if (!confirm("Delete the latest ballot? Back up first if you want to keep it.")) return; setContent(state, "ap", P.slice(0, -1)); week = P.length - 2; await persist(); ap(); };
    }
    function editor() {
      const e = editing, P = polls(), prev = e.isNew ? P[P.length - 1] : P[P.length - 2];
      const prevRank = new Map((prev ? prev.ranks : []).map((id, i) => [id, i + 1]));
      const opts = core.teams.map((t) => ({ value: String(t.id), label: t.name, search: t.conf + " " + t.slug, html: `<span>${esc(t.name)}</span><span class="sub">${t.w}-${t.l} · #${t.rank}</span>` }));
      const dupes = e.ranks.filter((id, i) => e.ranks.indexOf(id) !== i);
      panel.innerHTML = `
        <div class="card-head"><h2>${e.week === 0 ? "Preseason ballot" : "Week " + e.week + " ballot"}</h2><span class="muted">${e.week === 0 ? "before day 1" : "after day " + e.afterDay}</span></div>
        <p class="muted" style="margin-top:-4px">Pre-filled with a suggestion (rating, adjusted for record). Swap any team with the box, move it with the arrows. Nothing is saved until you press Save.</p>
        <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th class="r">Record</th><th class="r">Rating</th><th class="c">Last week</th><th></th></tr></thead><tbody>
          ${e.ranks.map((id, i) => { const t = core.teams[id];
            return `<tr data-i="${i}"><td class="rank c">${i + 1}</td><td style="min-width:240px"><div class="ed-team"></div></td><td class="r num">${t.w}-${t.l}</td><td class="r num">${t.rating.toFixed(1)}</td><td class="c">${rankMove(prevRank, id, i + 1)}</td>
              <td class="r" style="white-space:nowrap"><button class="btn ghost ed-up" type="button" aria-label="Move up" ${i ? "" : "disabled"}>▲</button> <button class="btn ghost ed-dn" type="button" aria-label="Move down" ${i < 24 ? "" : "disabled"}>▼</button></td></tr>`; }).join("")}
        </tbody></table></div>
        ${dupes.length ? `<p class="down" style="margin:10px 0 0">A team is on the ballot twice: ${dupes.map((id) => esc(core.teams[id].name)).join(", ")}</p>` : ""}
        <div class="btn-row" style="margin-top:14px"><button class="btn" id="saveBallot" type="button" ${dupes.length ? "disabled" : ""}>Save ballot</button><button class="btn ghost" id="sugBallot" type="button">Reset to suggestion</button><button class="btn ghost" id="cancelBallot" type="button">Cancel</button></div>`;
      panel.querySelectorAll("tr[data-i]").forEach((tr) => {
        const i = +tr.dataset.i;
        combobox(tr.querySelector(".ed-team"), { value: String(e.ranks[i]), options: opts, onChange: (v) => { e.ranks[i] = +v; editor(); } });
        tr.querySelector(".ed-up").onclick = () => { [e.ranks[i - 1], e.ranks[i]] = [e.ranks[i], e.ranks[i - 1]]; editor(); };
        tr.querySelector(".ed-dn").onclick = () => { [e.ranks[i + 1], e.ranks[i]] = [e.ranks[i], e.ranks[i + 1]]; editor(); };
      });
      panel.querySelector("#sugBallot").onclick = () => { e.ranks = suggestBallot(); editor(); };
      panel.querySelector("#cancelBallot").onclick = () => { editing = null; ap(); };
      panel.querySelector("#saveBallot").onclick = async () => {
        const ballot = { week: e.week, afterDay: e.afterDay, ranks: e.ranks.slice() };
        const next = e.isNew ? [...P, ballot] : [...P.slice(0, -1), ballot];
        setContent(state, "ap", next);
        // a Power Poll snapshot goes with every ballot, like the workbook's weekly routine
        const pw = (state.content.power || []).filter((x) => x.week !== ballot.week);
        setContent(state, "power", [...pw, snapshot(ballot.week)].sort((a, b) => a.week - b.week));
        await persist(); editing = null; week = next.length - 1; ap();
      };
    }
    function snapshot(wk) {
      const top = core.teams.filter((t) => t.gp).sort((a, b) => a.rank - b.rank).slice(0, 25);
      return { week: wk, afterDay: season.day, ranks: top.map((t) => t.id), ratings: top.map((t) => +t.rating.toFixed(2)) };
    }
    let pweek = null;
    function poll() {
      const P = state.content.power || [];
      if (!P.length) { panel.innerHTML = `<div class="empty"><h3>No Power Poll snapshots</h3><p class="muted">A snapshot of the top 25 power ratings is saved with every AP ballot${season.status !== "complete" ? ", or take one now" : ""}.</p>${season.status !== "complete" && season.day ? `<div class="btn-row" style="justify-content:center"><button class="btn" id="snap" type="button">Snapshot now</button></div>` : ""}</div>`; wireSnap(); return; }
      if (pweek == null || pweek >= P.length) pweek = P.length - 1;
      const p = P[pweek], prev = pweek > 0 ? P[pweek - 1] : null, prevRank = new Map((prev ? prev.ranks : []).map((id, i) => [id, i + 1]));
      panel.innerHTML = `
        <div class="card-head"><h2>Power Poll &middot; ${p.week === 0 ? "Preseason" : "Week " + p.week}</h2><span class="muted">top 25 power ratings after day ${p.afterDay}</span></div>
        <div class="poll-tabs" role="tablist" aria-label="Snapshot week">${P.map((x, i) => `<button type="button" role="tab" class="${i === pweek ? "on" : ""}" data-i="${i}">${x.week === 0 ? "Pre" : "Wk " + x.week}</button>`).join("")}</div>
        <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th>Conf</th><th class="r">Record then</th><th class="c">Move</th><th class="r">Rating then</th><th class="r">Now</th></tr></thead><tbody>
          ${p.ranks.map((id, i) => { const t = core.teams[id]; return `<tr><td class="rank c">${i + 1}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td class="r num">${recordAsOf(core, id, p.afterDay)}</td><td class="c">${rankMove(prevRank, id, i + 1)}</td><td class="r num">${p.ratings ? `<b>${p.ratings[i].toFixed(1)}</b>` : "—"}</td><td class="r num muted">${t.rating.toFixed(1)}</td></tr>`; }).join("")}
        </tbody></table></div>
        ${season.status !== "complete" ? `<div class="btn-row" style="margin-top:14px"><button class="btn ghost" id="snap" type="button">Snapshot now (after day ${season.day})</button></div>` : ""}`;
      panel.querySelectorAll(".poll-tabs button").forEach((b) => b.onclick = () => { pweek = +b.dataset.i; poll(); });
      wireSnap();
    }
    function wireSnap() {
      const b = panel.querySelector("#snap"); if (!b) return;
      b.onclick = async () => {
        const P = state.content.power || [], apW = polls().length ? polls()[polls().length - 1].week : 0;
        const wk = P.some((x) => x.week === apW && x.afterDay === season.day) ? apW : Math.max(apW, P.length ? P[P.length - 1].week + (P[P.length - 1].afterDay === season.day ? 0 : 1) : apW);
        setContent(state, "power", [...P.filter((x) => x.week !== wk), snapshot(wk)].sort((x, y) => x.week - y.week));
        await persist(); pweek = null; poll();
      };
    }

    const show = () => { tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab)); tab === "ap" ? (editing ? editor() : ap()) : tab === "poll" ? poll() : power(); };
    tabs.querySelectorAll("button").forEach((b) => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, "", tab === "ap" ? "#ap" : tab === "poll" ? "#poll" : "#"); show(); });
    show();
  } catch (e) { fail(view, e); }
})();
