import { shell, fail } from "../ui.js";
import { loadCore, esc, teamLink, signed, recordAsOf } from "../data.js";

(async function main() {
  const view = shell("rankings");
  try {
    const core = await loadCore();
    let tab = location.hash === "#ap" ? "ap" : "power";
    const st = { sort: "rank", dir: 1, conf: "", tier: "" };
    let week = core.polls.length - 1;

    view.innerHTML = `
      <div class="page-title"><span class="kicker">Season 1 final</span><h1>Rankings</h1>
        <p>Power ratings come from the sim itself: average margin plus the strength of everyone you played, solved for all 365 teams at once. The AP Top 25 is the committee's weekly poll.</p></div>
      <div class="seg" style="margin-bottom:16px" id="tabs"><button type="button" data-t="power">Power ratings</button><button type="button" data-t="ap">AP Top 25</button></div>
      <div class="card plain" id="panel"></div>`;
    const panel = document.getElementById("panel");
    const tabs = document.getElementById("tabs");

    const COLS = [
      ["rank", "#", (t) => t.rank, "c"], ["name", "Team", null], ["conf", "Conf", null], ["tier", "Tier", null],
      ["w", "Record", null, "r"], ["margin", "Margin/G", null, "r"], ["oppRating", "SOS", null, "r"], ["rating", "Rating", null, "r"],
    ];
    const val = (t, k) => (k === "name" ? t.name : k === "conf" ? t.conf : k === "tier" ? t.tier : k === "w" ? t.w / (t.w + t.l) : t[k]);

    function power() {
      let rows = core.teams.filter((t) => (!st.conf || t.conf === st.conf) && (!st.tier || t.tier === st.tier));
      rows.sort((a, b) => {
        const x = val(a, st.sort), y = val(b, st.sort);
        return (typeof x === "string" ? x.localeCompare(y) : x - y) * st.dir || a.rank - b.rank;
      });
      const mx = Math.max(...core.teams.map((t) => t.rating)), mn = Math.min(...core.teams.map((t) => t.rating));
      panel.innerHTML = `
        <div class="btn-row" style="margin-bottom:14px">
          <div class="field" style="min-width:200px"><label for="fc">Conference</label><select id="fc"><option value="">All conferences</option>${core.confs.map((c) => `<option${c === st.conf ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
          <div class="field" style="min-width:140px"><label for="ft">Tier</label><select id="ft"><option value="">All tiers</option>${["S", "A", "B", "C", "D", "F"].map((c) => `<option${c === st.tier ? " selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field" style="align-self:end"><span class="muted">${rows.length} teams</span></div>
        </div>
        <div class="table-wrap"><table><thead><tr>${COLS.map(([k, label, , al]) => `<th class="sortable ${al || ""} ${st.sort === k ? "sorted" : ""}" data-k="${k}" aria-sort="${st.sort === k ? (st.dir > 0 ? "ascending" : "descending") : "none"}">${label}${st.sort === k ? (st.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead><tbody>
          ${rows.map((t) => `<tr><td class="rank c">${t.rank}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td><span class="pill">${esc(t.tier)}</span></td><td class="r num">${t.w}-${t.l}</td><td class="r num ${t.margin >= 0 ? "up" : "down"}">${signed(t.margin)}</td><td class="r num muted">${t.oppRating.toFixed(1)}</td>
            <td class="r"><div class="bar-cell" style="justify-content:flex-end"><i style="width:${Math.max(4, ((t.rating - mn) / (mx - mn)) * 70)}px"></i><span><b>${t.rating.toFixed(1)}</b></span></div></td></tr>`).join("")}
        </tbody></table></div>`;
      panel.querySelector("#fc").onchange = (e) => { st.conf = e.target.value; power(); };
      panel.querySelector("#ft").onchange = (e) => { st.tier = e.target.value; power(); };
      panel.querySelectorAll("th.sortable").forEach((th) => th.onclick = () => {
        const k = th.dataset.k;
        if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = ["rank", "name", "conf", "tier"].includes(k) ? 1 : -1; }
        power();
      });
    }

    function ap() {
      const p = core.polls[week], prev = week > 0 ? core.polls[week - 1] : null;
      const prevRank = new Map((prev ? prev.ranks : []).map((id, i) => [id, i + 1]));
      panel.innerHTML = `
        <div class="card-head"><h2>Week ${esc(p.week)}</h2><span class="muted">Released after day ${p.afterDay}</span></div>
        <div class="poll-tabs" role="tablist" aria-label="Poll week">${core.polls.map((x, i) => `<button type="button" role="tab" class="${i === week ? "on" : ""}" data-i="${i}">${x.week === 0 ? "Pre" : "Wk " + x.week}</button>`).join("")}</div>
        <div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Team</th><th>Conf</th><th class="r">Record</th><th class="c">Move</th><th class="r">Rating</th></tr></thead><tbody>
          ${p.ranks.map((id, i) => {
            const t = core.teams[id], pr = prevRank.get(id), r = i + 1;
            const mv = !prev ? "" : pr == null ? '<span class="pill warm">NEW</span>' : pr === r ? '<span class="faint">—</span>' : pr > r ? `<span class="up">▲ ${pr - r}</span>` : `<span class="down">▼ ${r - pr}</span>`;
            return `<tr><td class="rank c">${r}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td class="r num">${recordAsOf(core, id, p.afterDay)}</td><td class="c">${mv}</td><td class="r num"><b>${t.rating.toFixed(1)}</b></td></tr>`;
          }).join("")}
        </tbody></table></div>
        <p class="faint" style="margin:12px 0 0;font-size:.82rem">Rating shown is each team's final Season 1 rating. The poll itself doesn't feed the simulation.</p>`;
      panel.querySelectorAll(".poll-tabs button").forEach((b) => b.onclick = () => { week = +b.dataset.i; ap(); });
    }

    const show = () => { tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.t === tab)); tab === "ap" ? ap() : power(); };
    tabs.querySelectorAll("button").forEach((b) => b.onclick = () => { tab = b.dataset.t; history.replaceState(null, "", tab === "ap" ? "#ap" : "#"); show(); });
    show();
  } catch (e) { fail(view, e); }
})();
