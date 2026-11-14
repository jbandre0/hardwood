import { shell, fail } from "../ui.js";
import { loadCore, resetCores, esc, badge } from "../data.js";
import { setContent, toOverlay } from "../league/league.js";
import { saveOverlay } from "../league/store.js";
import { statsAsOf } from "../league/insights.js";
import { gamesFor, prunePicks, setPick, isSlot, slotTeams, seedMap, slotRating, completePicks, chalkPicks, ratingPicks, scoreEntry, ROUND_POINTS, ROUND_NAMES } from "../league/challenge.js";
import { articleHTML } from "../data.js";

const REGIONS = ["East", "South", "West", "Midwest"];

(async function main() {
  const view = shell("challenge");
  try {
    const core = await loadCore();
    const { state, season, teams } = core, field = core.ncaa.field;
    const hq = core.data.challenge && core.data.challenge.hq;
    if (!field || field.length !== 68) {
      view.innerHTML = `<div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Bracket challenge</h1>
        <p>Fill in all 67 games of the NCAA bracket before it starts, then watch it score as the tournament plays. Bracketology HQ files its own bracket, and two simple bots (all chalk, and always the better power rating) play along.</p></div>
        <div class="card empty"><h3>The field isn't set yet</h3><p>The bracket exists once the conference tournaments are done (day 47) and the 68-team field is built on the Commissioner desk. Entries stay open until the First Four tips off on day 48.</p>
        <div class="btn-row" style="justify-content:center"><a class="btn" href="bracketology.html">See the projected field</a></div></div>`;
      return;
    }
    const seedOf = seedMap(field);
    const locked = state.games.some((g) => g.type === "NCAA" && g.ptsA != null);
    const actual = state.games.filter((g) => g.type === "NCAA");
    const actualWin = new Map(actual.filter((g) => g.ptsA != null).map((g) => [g.id, g.ptsA > g.ptsB ? g.a : g.b]));
    // bots use the ratings going into the tournament, so they never change once it starts
    const pre = statsAsOf(state, 47), rating = slotRating(field, (id) => (pre[id].GP ? pre[id].rating : pre[id].tierRating));
    // a First Four slot ("Michigan St. / Texas A&M") reads as its winner once that game is played
    const ffWon = (t) => actualWin.get(5810 + (-t) - 1);
    const real = (t) => (isSlot(t) ? ffWon(t) ?? t : t);
    const nameOf = (t) => { const r = real(t); return isSlot(r) ? slotTeams(field, r).map((x) => teams[x].name).join(" / ") : teams[r].name; };
    const entries = [];
    const ch = state.content.challenge || {}, mine = ch.you;
    const extras = () => ch.extra || (ch.extra = []);   // more human entries (a friend on the same couch): [{id, name, picks}]
    // picks made against an older field (before the official one replaced it) drop the games that no longer exist
    entries.push({ key: "you", name: ch.youName || "You", picks: mine ? prunePicks(field, mine.picks) : {}, mine: true });
    for (const x of extras()) entries.push({ key: "x" + x.id, name: x.name, picks: prunePicks(field, x.picks || {}), mine: true, x });
    if (hq) entries.push({ key: "hq", name: "Bracketology HQ", picks: hq.picks });
    entries.push({ key: "chalk", name: "Chalk (bot)", picks: chalkPicks(field, rating) });
    entries.push({ key: "rating", name: "Power ratings (bot)", picks: ratingPicks(field, rating) });
    let viewKey = new URLSearchParams(location.search).get("e") || "you";
    if (!entries.some((e) => e.key === viewKey)) viewKey = "you";
    if (locked && !new URLSearchParams(location.search).get("e") && !Object.keys(entries[0].picks).length) viewKey = (entries.find((e) => !e.mine) || entries[0]).key;   // nothing of yours to show: start on the next entry
    const persist = async () => { await saveOverlay(season.id, toOverlay(state)); };
    const saveChallenge = async () => { setContent(state, "challenge", { ...ch }); await persist(); };
    const E = (k) => entries.find((e) => e.key === k);

    function leaderboard() {
      const rows = entries.filter((e) => !e.mine || Object.keys(e.picks).length).map((e) => ({ e, s: scoreEntry(field, e.picks, actual) })).sort((a, b) => b.s.total - a.s.total || b.s.maxRemaining - a.s.maxRemaining);
      return `<div class="table-wrap"><table><thead><tr><th class="c">#</th><th>Entry</th><th class="r">Points</th><th class="r">Upset bonus</th><th class="r">Total</th><th class="r">Right</th><th class="r">Still possible</th><th>Champion pick</th></tr></thead><tbody>
        ${rows.map(({ e, s }, i) => `<tr class="clickable ${e.key === viewKey ? "on-deck" : ""}" data-e="${e.key}"><td class="rank c">${locked || s.decided ? i + 1 : "—"}</td><td><b>${esc(e.name)}</b>${e.mine ? ` <span class="pill mint">${e.x ? "entry" : "you"}</span>` : ""}</td><td class="r num">${s.points}</td><td class="r num muted">${s.bonus ? "+" + s.bonus : "0"}</td><td class="r num"><b>${s.total}</b></td><td class="r num">${s.correct}/${s.decided}</td><td class="r num ${s.decided && s.maxRemaining < s.total ? "down" : "muted"}">${s.picked >= 67 ? s.maxRemaining : "—"}</td>
        <td>${s.champion != null ? `${esc(nameOf(s.champion))} <span class="faint">(${seedOf.get(s.champion)})</span>${s.decided && !s.championAlive ? ' <span class="pill warm">out</span>' : ""}` : '<span class="faint">none yet</span>'}</td></tr>`).join("")}
        </tbody></table></div>`;
    }

    function bracket(picks, interactive) {
      const map = new Map(gamesFor(field, picks).map((g) => [g.id, g]));
      const row = (g, t) => {
        const sel = picks[g.id] === t, act = actualWin.get(g.id), rt = real(t), name = nameOf(t);
        const tip = isSlot(rt) ? `First Four winner: ${name}` : `${teams[rt].name} (${teams[rt].w}-${teams[rt].l})`;
        const cls = ["tm", "pickable", sel ? "win" : "", act != null && sel ? (act === rt ? "ok" : "bad") : "", act != null && !sel && act === rt ? "truth" : ""].join(" ");
        return `<button type="button" class="${cls}" data-g="${g.id}" data-t="${t}" ${interactive ? "" : "disabled"} title="${esc(tip)}"><span class="sd">${seedOf.get(t)}</span><span class="nm">${esc(name)}</span><span class="pts">${sel ? "✓" : ""}</span></button>`;
      };
      const box = (id) => { const g = map.get(id); return g ? `<div class="game">${row(g, g.a)}${row(g, g.b)}</div>` : `<div class="game"><div class="tm"><span class="sd"></span><span class="nm faint">&nbsp;</span><span class="pts"></span></div><div class="tm"><span class="sd"></span><span class="nm faint">&nbsp;</span><span class="pts"></span></div></div>`; };
      const col = (ids) => { const boxes = ids.map(box), out = []; for (let i = 0; i < boxes.length; i += 2) out.push(`<div class="pair">${boxes[i]}${boxes[i + 1]}</div>`); return `<div class="round">${out.join("")}</div>`; };
      const region = (R, flip) => {
        const r = REGIONS.indexOf(R), ids = (base, n, per) => Array.from({ length: n }, (_, k) => base + r * per + k);
        const champ = picks[5870 + r];
        return `<section class="region ${flip ? "flip" : ""}"><div class="region-title"><h2>${R}</h2>${champ != null ? `<span class="pill mint">${esc(nameOf(champ))}</span>` : ""}</div>
          ${["Round of 64", "Round of 32", "Sweet 16", "Elite Eight"].map((l) => `<div class="round-label">${l}</div>`).join("")}${col(ids(5814, 8, 8))}${col(ids(5846, 4, 4))}${col(ids(5862, 2, 2))}<div class="round">${box(5870 + r)}</div></section>`;
      };
      const champ = picks[5876];
      return `<div class="bracket-scroll"><div class="bracket">${region("East", false)}${region("West", true)}
        <div class="ff-center"><div><div class="round-label" style="margin-bottom:6px">East vs South</div>${box(5874)}</div>
          <div class="champ-card"><div class="crown">${champ != null ? "Champion pick" : "Pick a champion"}</div>${champ != null ? `${isSlot(real(champ)) ? "" : badge(teams[real(champ)], 64)}<h2>${esc(nameOf(champ))}</h2>` : "<h2>?</h2>"}<div style="margin-top:14px">${box(5876)}</div></div>
          <div><div class="round-label" style="margin-bottom:6px">West vs Midwest</div>${box(5875)}</div></div>
        ${region("South", false)}${region("Midwest", true)}</div></div>
        <div class="card" style="margin-top:14px"><div class="card-head"><h3 style="margin:0">First Four</h3><span class="muted">Day 48, Dayton</span></div><div class="grid cols-2" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${[5810, 5811, 5812, 5813].map(box).join("")}</div></div>`;
    }

    // switching entries redraws the bracket further down the page: take the reader there so the switch is visible
    const toBracket = () => { const el = document.querySelector(".chal"); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 140, behavior: "smooth" }); };

    function draw() {
      history.replaceState(null, "", `?e=${viewKey}`);
      const e = E(viewKey), editable = e.mine && !locked, n = Object.keys(e.picks).length;
      const sc = scoreEntry(field, e.picks, actual);
      view.innerHTML = `
        <div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Bracket challenge</h1>
          <p>Fill in all 67 games before the First Four tips off. Correct picks score ${Object.entries(ROUND_POINTS).map(([d, p]) => `${p} (${ROUND_NAMES[d].toLowerCase()})`).join(", ")}, plus a bonus equal to the seed gap when you call an upset. ${locked ? "<b>Entries are locked: the tournament has started.</b>" : "Picks save automatically; you can change them until day 48 is played."}</p></div>
        <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Leaderboard</h2><span class="muted">click an entry to see its bracket</span></div>${leaderboard()}
          <p class="faint" style="margin:10px 0 0;font-size:.82rem">The bots use the power ratings going into the tournament: Chalk always takes the better seed (ratings break ties), Power ratings always takes the better rating. Possible = points still available from picks whose team is alive.</p></div>
        ${viewKey === "hq" && hq ? `<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>${esc(hq.headline)}</h2><span class="pill mint">Bracketology HQ</span></div><div class="prose">${articleHTML(hq.writeup)}</div></div>` : ""}
        ${!locked ? `<div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Your entries</h2><span class="muted">anyone on this device can file a bracket: add one per person</span></div>
          <div class="btn-row">${entries.filter((x) => x.mine).map((x) => `<button class="btn ${x.key === viewKey ? "" : "ghost"}" type="button" data-pick="${x.key}">${esc(x.name)} <span class="faint">(${Object.keys(x.picks).length}/67)</span></button>`).join("")}<button class="btn ghost" id="addEntry" type="button">+ Add entry</button>${e.mine ? '<button class="btn ghost" id="renameEntry" type="button">Rename</button>' : ""}${e.x ? '<button class="btn ghost" id="deleteEntry" type="button">Delete this entry</button>' : ""}</div></div>` : ""}
        <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>${e.key === "you" && !ch.youName ? "Your bracket" : `${esc(e.name)}${/s$/i.test(e.name) ? "'" : "'s"} bracket`}</h2><span class="muted">${n} of 67 picked${sc.decided ? ` &middot; ${sc.correct} of ${sc.decided} decided games right` : ""}</span></div>
          ${editable ? `<div class="btn-row" style="margin-bottom:12px"><button class="btn ghost" id="fillChalk" type="button">Fill the rest with chalk</button><button class="btn ghost" id="fillRating" type="button">Fill the rest with ratings</button>${hq ? '<button class="btn ghost" id="copyHq" type="button">Start from HQ\'s bracket</button>' : ""}<button class="btn ghost" id="clear" type="button">Clear</button></div>` : e.mine && !n ? '<p class="muted">You didn\'t file a bracket before the tournament started.</p>' : ""}
          ${editable ? '<p class="faint" style="margin:0 0 10px;font-size:.82rem">Click a team to advance it. Changing an early pick clears the later picks that depended on it.</p>' : ""}
          <div class="chal ${editable ? "editable" : ""}">${bracket(e.picks, editable)}</div></div>`;
      view.querySelectorAll("tr[data-e]").forEach((tr) => tr.onclick = () => { viewKey = tr.dataset.e; draw(); toBracket(); });
      view.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { viewKey = b.dataset.pick; draw(); toBracket(); });
      const add = view.querySelector("#addEntry");
      if (add) add.onclick = async () => {
        const name = (prompt("Name for the new entry (a friend, a nickname):") || "").trim().slice(0, 40);
        if (!name) return;
        const id = Date.now().toString(36); extras().push({ id, name, picks: {}, savedAt: new Date().toISOString() });
        await saveChallenge(); location.search = `?e=x${id}`;
      };
      const ren = view.querySelector("#renameEntry");
      if (ren) ren.onclick = async () => {
        const name = (prompt("Rename this entry:", e.name) || "").trim().slice(0, 40); if (!name) return;
        if (e.x) e.x.name = name; else ch.youName = name;
        await saveChallenge(); location.reload();
      };
      const del = view.querySelector("#deleteEntry");
      if (del) del.onclick = async () => {
        if (!confirm(`Delete ${e.name}'s entry and its picks?`)) return;
        ch.extra = extras().filter((x) => x !== e.x); await saveChallenge(); location.search = "?e=you";
      };
      if (editable) {
        const save = async (p) => {
          e.picks = p;
          if (e.x) e.x.picks = p; else ch.you = { picks: p, savedAt: new Date().toISOString() };
          await saveChallenge(); draw();
        };
        view.querySelectorAll("button.pickable").forEach((b) => b.onclick = () => save(setPick(field, e.picks, +b.dataset.g, +b.dataset.t)));
        view.querySelector("#fillChalk").onclick = () => save(completePicks(field, (a, b) => (seedOf.get(a) !== seedOf.get(b) ? (seedOf.get(a) < seedOf.get(b) ? a : b) : rating(a) >= rating(b) ? a : b), e.picks));
        view.querySelector("#fillRating").onclick = () => save(completePicks(field, (a, b) => (rating(a) >= rating(b) ? a : b), e.picks));
        view.querySelector("#clear").onclick = () => { if (!Object.keys(e.picks).length || confirm("Clear your whole bracket?")) save({}); };
        const cp = view.querySelector("#copyHq"); if (cp) cp.onclick = () => { if (!Object.keys(e.picks).length || confirm("Replace your picks with Bracketology HQ's bracket?")) save({ ...hq.picks }); };
      }
    }
    draw();
  } catch (e) { fail(view, e); }
})();
