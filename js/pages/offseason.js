import { shell, fail } from "../ui.js";
import { loadCore, resetCores, esc, teamLinkPlain as teamLink, signed, seasonsIndex, fetchJSON, setActiveSeason } from "../data.js";
import { combobox } from "../combobox.js";
import { setContent, toOverlay } from "../league/league.js";
import { seasonSummary } from "../league/summary.js";
import { tierReview, seasonAwards, offseasonConfPower, DEFAULT_OFFSEASON } from "../league/offseason.js";
import { buildNextSeason } from "../league/newseason.js";
import { TIERS } from "../league/stats.js";
import { saveOverlay, saveLocalSeason, updateSeasonMeta, exportAll } from "../league/store.js";

(async function main() {
  const view = shell("offseason");
  try {
    const core = await loadCore();
    const { state, season, data, teams } = core, L = core.league;
    const idx = await seasonsIndex(), pos = idx.findIndex((s) => s.id === season.id), later = idx.slice(pos + 1);
    const summary = seasonSummary(state, core.calc, L, core.ncaa.field);
    const names = L.map((t) => t.name);
    // a season closed in Excel keeps its record in the next season's offseason.json
    let closedRecord = null;
    if (later.length && (later[0].files || []).includes("offseason")) {
      const o = await fetchJSON(`data/seasons/${later[0].id}/offseason.json`).catch(() => null);
      if (o && o.closedSeason === season.label) closedRecord = o;
    }
    const closing = state.content.closing || null;           // closed on this site
    const closed = !!(closedRecord || closing || later.length);
    const settings = { ...DEFAULT_OFFSEASON, ...(closedRecord?.settings || {}), ...(state.content.offseasonSettings || {}) };
    let overrides = { ...(closedRecord ? Object.fromEntries(closedRecord.tierReview.filter((r) => r.override).map((r) => [r.team, r.override])) : {}), ...(state.content.tierOverrides || {}) };
    const tierSnap = core.calc.tierRatingByTier;
    let filter = "moves", search = "";
    const persist = async () => { await saveOverlay(season.id, toOverlay(state)); };

    if (!summary.title) {
      const left = state.games.filter((g) => g.ptsA == null).length;
      view.innerHTML = `<div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Offseason</h1>
        <p>The offseason opens once the national championship is played. ${left ? `${left.toLocaleString()} scheduled games are still to play, plus the tournaments.` : "The tournaments still need to be played."}</p></div>
        <div class="card"><ol class="steps">
          <li>Finish the season: every game recorded, champion crowned <a class="btn ghost" href="play.html">Commissioner desk</a></li>
          <li>Archive the season and hand out the awards</li><li>Review tier moves and enter overrides</li><li>Check next season's starting stats</li><li>Edit marquee games and create the next season</li></ol></div>`;
      return;
    }

    function render() {
      const review = tierReview(summary.teams, tierSnap, settings, overrides);
      const awards = closedRecord && !state.content.tierOverrides ? closedRecord.awards : seasonAwards(summary, review, names, settings);
      const cp = offseasonConfPower(summary);
      const ups = review.filter((r) => r.change > 0).length, downs = review.filter((r) => r.change < 0).length, nOv = review.filter((r) => r.override).length;
      let rows = review.slice().sort((a, b) => b.rating - a.rating);
      if (filter === "moves") rows = rows.filter((r) => r.final !== r.oldTier || r.suggested !== r.oldTier || r.override);
      if (search) { const q = search.toLowerCase(); rows = rows.filter((r) => names[r.team].toLowerCase().includes(q)); }
      const tierCounts = TIERS.map((k) => [k, review.filter((r) => r.oldTier === k).length, review.filter((r) => r.final === k).length]);
      view.innerHTML = `
        <div class="page-title"><span class="kicker">${esc(season.label)} &middot; ${closed ? "closed" : "ready to close"}</span><h1>Offseason</h1>
          <p>Awards, the tier review and next season's starting lines. ${closed ? "This season is already closed; the tier review below shows what was applied." : "Tier moves, settings and marquee games are saved as you change them. Nothing is created until you press the button at the bottom."}</p></div>
        <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Season awards</h2><span class="muted">same rules as the workbook</span></div>
          <div class="award-grid">${awards.map((a) => `<div class="award"><small>${esc(a.award)}</small><b>${esc(a.team)}</b><span>${esc(a.detail || "")}</span></div>`).join("")}</div></div>
        <div class="grid cols-main" style="margin-bottom:18px">
          <div class="card plain"><div class="card-head"><h2>Tier review</h2><span class="muted">${ups} up &middot; ${downs} down &middot; ${nOv} overrides</span></div>
            <p class="muted" style="margin-top:-4px">Teams within ${settings.moveGap} points of their tier rating keep their tier. Further away, they move toward the nearest tier, at most ${settings.maxMoves} steps. ${closed ? "" : "Click a tier letter to override (click it again to clear). The outlined letter is the suggestion."}</p>
            <div class="btn-row" style="margin-bottom:12px"><div class="seg" id="flt"><button type="button" data-f="moves" class="${filter === "moves" ? "on" : ""}">Moves and overrides</button><button type="button" data-f="all" class="${filter === "all" ? "on" : ""}">All 365</button></div>
              <div class="field" style="min-width:200px"><input type="search" id="q" placeholder="Find a team" value="${esc(search)}" aria-label="Find a team"></div></div>
            <div class="table-wrap"><table><thead><tr><th>Team</th><th class="c">Old</th><th class="r">Rating</th><th class="r">Tier rtg</th><th class="r">Gap</th><th class="c">Next season</th><th>Note</th></tr></thead><tbody>
              ${rows.map((r) => `<tr><td>${teamLink(teams[r.team])}</td><td class="c"><span class="pill">${r.oldTier}</span></td><td class="r num">${r.rating.toFixed(1)}</td><td class="r num muted">${r.tierRating.toFixed(1)}</td><td class="r num ${r.gap >= 0 ? "up" : "down"}">${signed(r.gap)}</td>
                <td class="c">${closed ? `<b>${r.final}</b>${r.change ? ` <span class="${r.change > 0 ? "up" : "down"}">${r.change > 0 ? "▲" : "▼"}</span>` : ""}` : `<span class="tier-pick" data-team="${r.team}">${TIERS.map((k) => `<button type="button" data-t="${k}" class="${k === r.final ? "on" : ""} ${k === r.suggested && k !== r.final ? "sug" : ""}" aria-label="${esc(names[r.team])} tier ${k}">${k}</button>`).join("")}</span>`}</td>
                <td class="muted">${esc(r.note)}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">No teams match.</td></tr>`}
            </tbody></table></div></div>
          <div class="stack">
            <div class="card"><div class="card-head"><h2>Tiers next season</h2></div><table><thead><tr><th>Tier</th><th class="r">Now</th><th class="r">Next</th><th class="r">Net</th></tr></thead><tbody>
              ${tierCounts.map(([k, a, b]) => `<tr><td><span class="pill">${k}</span></td><td class="r num">${a}</td><td class="r num"><b>${b}</b></td><td class="r num ${b - a > 0 ? "up" : b - a < 0 ? "down" : "muted"}">${b - a > 0 ? "+" : ""}${b - a}</td></tr>`).join("")}</tbody></table></div>
            <div class="card"><div class="card-head"><h2>Settings</h2></div>
              <div class="grid cols-2" style="gap:12px">
                ${[["carry", "Carry-over from last season", 0.05], ["moveGap", "Gap that triggers a move", 1], ["maxMoves", "Most tiers a team can move", 1], ["cinderellaMaxSeed", "Cinderella: lowest seed", 1]].map(([k, label, step]) => `<div class="field"><label for="s_${k}">${label}</label><input type="number" id="s_${k}" data-k="${k}" step="${step}" value="${settings[k]}" ${closed ? "disabled" : ""}></div>`).join("")}
              </div><p class="faint" style="margin:10px 0 0;font-size:.82rem">Next season's starting stats = ${Math.round(settings.carry * 100)}% of each team's final engine line + ${Math.round(100 - settings.carry * 100)}% of its new tier's line.</p></div>
            <div class="card plain"><div class="card-head"><h2>Conference power</h2></div><div class="table-wrap"><table><thead><tr><th>Conference</th><th class="r">Avg</th><th class="r">Bids</th><th class="r">NCAA W</th></tr></thead><tbody>
              ${cp.map((r) => `<tr><td>${esc(r.conf)}</td><td class="r num">${signed(r.avgRating)}</td><td class="r num">${r.ncaaBids}</td><td class="r num">${r.tourneyWins}</td></tr>`).join("")}</tbody></table></div></div>
          </div>
        </div>
        ${closed ? (later.length ? `<div class="card"><p class="muted" style="margin:0">${esc(later[0].label)} was created from this season. Switch to it with the season picker at the top.</p></div>` : "") : marqueeCard()}`;
      wire();
    }

    const prevMarquee = state.content.nextMarquee || (data.marquee || []).map((m) => ({ ...m, day: null }));
    let marquee = prevMarquee.map((m) => ({ ...m }));
    function marqueeCard() {
      const nextNo = (parseInt(String(season.label).replace(/\D+/g, ""), 10) || idx.length) + 1;
      return `<div class="card" id="mq"><div class="card-head"><h2>Create Season ${nextNo}</h2><span class="muted">${marquee.length} marquee games</span></div>
        <p class="muted">Marquee games are fixed non-conference matchups that always make the schedule (they may repeat last year's pairings). Edit the list, then create the season. The new schedule uses fresh random seeds and is checked by the same validator as Season 2's.</p>
        <div class="table-wrap"><table><thead><tr><th>Visitor</th><th>Host</th><th>Site</th><th class="r">Day</th><th></th></tr></thead><tbody id="mqRows">
          ${marquee.map((m, i) => `<tr data-i="${i}"><td><div class="mq-v"></div></td><td><div class="mq-h"></div></td><td><div class="mq-s"></div></td><td class="r" style="width:90px"><input type="number" min="1" max="20" class="mq-d" value="${m.day ?? ""}" placeholder="any" aria-label="Day"></td><td><button class="btn ghost mq-x" type="button" aria-label="Remove">✕</button></td></tr>`).join("")}
        </tbody></table></div>
        <div class="btn-row" style="margin-top:12px"><button class="btn ghost" id="mqAdd" type="button">Add marquee game</button></div>
        <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
        <ol class="steps" style="margin-bottom:14px">
          <li class="done">Season finished: ${esc(names[summary.title.champion])} won it all</li>
          <li>Archive ${esc(season.label)} (awards, tier review, tournament results; games stay as they are)</li>
          <li>Apply tier moves and build Season ${nextNo}'s starting lines</li>
          <li>Generate and validate the Season ${nextNo} schedule</li></ol>
        <div class="btn-row"><button class="btn" id="create" type="button">Back up, then create Season ${nextNo}</button></div><p class="status" id="status" aria-live="polite"></p></div>`;
    }

    function wire() {
      view.querySelectorAll("#flt button").forEach((b) => b.onclick = () => { filter = b.dataset.f; render(); });
      const q = view.querySelector("#q"); if (q) q.oninput = () => { search = q.value; const pos = q.selectionStart; render(); const q2 = view.querySelector("#q"); q2.focus(); q2.setSelectionRange(pos, pos); };
      view.querySelectorAll(".tier-pick button").forEach((b) => b.onclick = async () => {
        const team = +b.parentElement.dataset.team, t = b.dataset.t, row = tierReview([summary.teams[team]], tierSnap, settings, {})[0];
        if (t === row.suggested || overrides[team] === t) delete overrides[team]; else overrides[team] = t;
        setContent(state, "tierOverrides", { ...overrides }); await persist(); render();
      });
      view.querySelectorAll("input[data-k]").forEach((inp) => inp.onchange = async () => {
        const v = parseFloat(inp.value); if (!Number.isFinite(v)) return;
        settings[inp.dataset.k] = v; setContent(state, "offseasonSettings", { ...settings }); await persist(); render();
      });
      const teamOpts = L.map((t) => ({ value: t.name, label: t.name, search: teams[t.id].conf }));
      const saveMq = async () => { setContent(state, "nextMarquee", marquee.map((m) => ({ ...m }))); await persist(); };
      view.querySelectorAll("#mqRows tr").forEach((tr) => {
        const i = +tr.dataset.i, m = marquee[i];
        combobox(tr.querySelector(".mq-v"), { value: m.visitor, options: teamOpts, placeholder: "Visitor", onChange: (v) => { m.visitor = v; saveMq(); } });
        combobox(tr.querySelector(".mq-h"), { value: m.host, options: teamOpts, placeholder: "Host", onChange: (v) => { m.host = v; saveMq(); } });
        combobox(tr.querySelector(".mq-s"), { value: m.site, searchable: false, options: [{ value: "Neutral", label: "Neutral" }, { value: "Host home", label: "Host's home" }], onChange: (v) => { m.site = v; saveMq(); } });
        tr.querySelector(".mq-d").onchange = (e) => { const d = parseInt(e.target.value, 10); m.day = d >= 1 && d <= 20 ? d : null; saveMq(); };
        tr.querySelector(".mq-x").onclick = async () => { marquee.splice(i, 1); await saveMq(); render(); };
      });
      const add = view.querySelector("#mqAdd"); if (add) add.onclick = async () => { marquee.push({ visitor: L[0].name, host: L[1].name, site: "Neutral", day: null }); await saveMq(); render(); };
      const btn = view.querySelector("#create"); if (btn) btn.onclick = createNext;
    }

    async function createNext() {
      const status = view.querySelector("#status");
      const nextNo = (parseInt(String(season.label).replace(/\D+/g, ""), 10) || idx.length) + 1;
      if (!confirm(`Close ${season.label} and create Season ${nextNo}? A backup file downloads first. ${season.label} stays viewable; its games can't be changed afterwards.`)) return;
      try {
        status.textContent = "Downloading a backup…";
        const blob = new Blob([JSON.stringify(await exportAll())], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `hardwood-backup-before-season-${nextNo}.json`; a.click();
        status.textContent = "Building the new season…";
        await new Promise((r) => setTimeout(r, 30));
        const review = tierReview(summary.teams, tierSnap, settings, overrides);
        const id = `season-${nextNo}`;
        const seeds = { conference: (Math.random() * 2 ** 31) >>> 0, nonConference: (Math.random() * 2 ** 31) >>> 0 };
        const next = buildNextSeason({ prev: data, prevState: state, prevCalc: core.calc, review, settings, marquee, seeds, id, label: `Season ${nextNo}` });
        next.files.offseason = { settings: { closedSeason: season.label, ...settings }, awards: seasonAwards(summary, review, names, settings), confPower: offseasonConfPower(summary), tierReview: review, closedSeason: season.label };
        next.info.files = Object.keys(next.files);
        await saveLocalSeason(next.info, next.files);
        setContent(state, "closing", { closedAt: new Date().toISOString(), next: id, settings, overrides, awards: next.files.offseason.awards, title: summary.title });
        await persist();
        await updateSeasonMeta((m) => { m.status[season.id] = "complete"; if (!m.local.includes(id)) m.local.push(id); m.current = id; });
        setActiveSeason(id); resetCores();
        status.textContent = `Season ${nextNo} created (${next.files.games.rows.length.toLocaleString()} games). Opening the Commissioner desk…`;
        setTimeout(() => { location.href = "play.html"; }, 600);
      } catch (e) { status.textContent = "Could not create the season: " + e.message; }
    }
    render();
  } catch (e) { fail(view, e); }
})();
