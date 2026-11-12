import { shell, fail } from "../ui.js";
import { loadCore, resetCores, esc, articleHTML } from "../data.js";
import { setContent, toOverlay } from "../league/league.js";
import { saveOverlay } from "../league/store.js";
import { weeklyInsights, draftArticle } from "../league/insights.js";

const TYPE_LABEL = { Weekly: "Weekly column", Bracketology: "Bracketology", "Tournament Review": "Tournament review", Preview: "Game preview" };

(async function main() {
  const view = shell("news");
  try {
    const core = await loadCore();
    const { state, season } = core;
    const live = season.status !== "complete";
    const qs = new URLSearchParams(location.search);
    let open = qs.has("a") ? +qs.get("a") : null, type = qs.get("type") || "", draft = null, insights = null;
    const persist = async () => { await saveOverlay(season.id, toOverlay(state)); resetCores(); };
    const arts = () => state.content.articles.map((a, i) => ({ ...a, i, type: a.type || (a.week != null ? "Bracketology" : "Article") }));
    const ap = state.content.ap || [];
    const lastAp = ap[ap.length - 1];
    const curWeek = !lastAp ? 0 : lastAp.afterDay === season.day ? lastAp.week : lastAp.week + 1;
    const lastWeekly = [...arts()].filter((a) => a.type === "Weekly" && a.to).sort((a, b) => b.to - a.to)[0];
    const fromDay = Math.min(season.day, Math.max(1, (lastWeekly ? lastWeekly.to : lastAp && lastAp.afterDay < season.day ? lastAp.afterDay : season.day - 2) + 1));

    function list() {
      const A = arts().filter((a) => !type || a.type === type).sort((a, b) => (b.to ?? b.week ?? 0) - (a.to ?? a.week ?? 0) || b.i - a.i);
      const types = [...new Set(arts().map((a) => a.type))];
      view.innerHTML = `
        <div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Articles</h1>
          <p>Weekly columns, bracketology and tournament writing for ${esc(season.label)}. ${live ? "The weekly column is drafted from the numbers (upsets judged by the ratings going into the week, engine what-ifs, a quick-model projection of the rest of the season); you edit it, then publish." : "Archived with the season."}</p></div>
        ${live && season.day ? `<div class="card" style="margin-bottom:18px" id="writer"><div class="card-head"><h2>This week's column</h2><span class="muted">week ${curWeek} &middot; ${fromDay === season.day ? `day ${fromDay}` : `days ${fromDay}-${season.day}`}</span></div>
          ${draft ? editorHTML() : `<p class="muted" style="margin-top:-4px">Builds a draft from ${fromDay === season.day ? `day ${fromDay}` : `days ${fromDay} to ${season.day}`}: the unbeaten list and its odds, the upset of the week, risers and fallers, luck, tier busters, engine what-ifs, conference races and where the season is headed. Takes a few seconds.</p>
          <div class="btn-row"><button class="btn" id="draftBtn" type="button">Draft the column</button></div><p class="status" id="status" aria-live="polite"></p>`}</div>` : ""}
        ${types.length > 1 ? `<div class="seg" style="margin-bottom:14px" id="types"><button type="button" data-t="" class="${!type ? "on" : ""}">All</button>${types.map((t) => `<button type="button" data-t="${esc(t)}" class="${type === t ? "on" : ""}">${esc(TYPE_LABEL[t] || t)}</button>`).join("")}</div>` : ""}
        ${A.length ? `<div class="stack">${A.map((a) => `<a class="card article-card" href="?a=${a.i}" data-i="${a.i}" style="display:block;color:inherit;text-decoration:none">
            <span class="kicker">${esc(TYPE_LABEL[a.type] || a.type)}${a.heading ? ` &middot; ${esc(a.heading)}` : a.week != null ? ` &middot; ${a.week === 0 ? "Preseason" : "Week " + a.week}` : ""}</span>
            <h2 style="margin:6px 0 8px;font-size:1.35rem;line-height:1.2">${esc(a.headline || a.heading || "Untitled")}</h2>
            <div class="muted prose" style="font-size:.92rem">${articleHTML(a.body, 1)}</div></a>`).join("")}</div>`
          : `<div class="card empty"><h3>No articles yet</h3><p class="muted">${live ? "Draft the first weekly column above." : "Nothing was archived for this season."}</p></div>`}`;
      wire();
    }

    function editorHTML() {
      return `<div class="field" style="margin-bottom:10px"><label for="hl">Headline</label><input type="text" id="hl" value="${esc(draft.headline)}"></div>
        <div class="field"><label for="body">Body <span class="faint">(a line in CAPITALS on its own becomes a section heading)</span></label><textarea id="body">${esc(draft.body)}</textarea></div>
        <div class="btn-row" style="margin-top:12px"><button class="btn" id="publish" type="button">Publish</button><button class="btn ghost" id="redraft" type="button">Draft again</button><button class="btn ghost" id="discard" type="button">Discard</button></div>
        <p class="status" id="status" aria-live="polite"></p>
        ${insights ? insightCards() : ""}`;
    }
    function insightCards() {
      const I = insights, pc = (p) => `${Math.round(p * 100)}%`;
      const card = (title, rows) => rows.length ? `<div class="card" style="background:var(--card-2)"><div class="card-head"><h3 style="margin:0">${title}</h3></div>${rows.join("")}</div>` : "";
      const row = (l, r) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid var(--line);font-size:.88rem"><span>${l}</span><span class="num muted">${r}</span></div>`;
      return `<h3 style="margin:22px 0 10px">The numbers behind the draft</h3><div class="grid cols-2" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        ${card("Upsets (chance going in)", I.upsets.map((u) => row(`${esc(u.winnerName)} over ${esc(u.loserName)}`, `${u.score} &middot; ${pc(u.pWin)}`)))}
        ${card("Unbeaten odds (quick model)", I.projection.unbeatenOdds.slice(0, 6).map((t) => row(esc(t.name), pc(t.pUnbeaten))))}
        ${card("Risers / fallers", [...I.risers.slice(0, 3), ...I.fallers.slice(0, 3)].map((t) => row(esc(t.name), `${t.delta >= 0 ? "+" : ""}${t.delta.toFixed(1)}`)))}
        ${card("Luck (wins vs expected)", [...I.luckiest, ...I.unluckiest].map((t) => row(esc(t.name), `${t.w}-${t.l} vs ${t.expW.toFixed(1)} exp`)))}
        ${card("Engine what-ifs", I.whatIfs.map((w) => row(`${esc(w.aName)} vs ${esc(w.bName)}`, `${pc(w.pA)} &middot; ${w.margin >= 0 ? "+" : ""}${w.margin.toFixed(1)}`)))}
        ${card("Closest conference races", I.projection.races.slice(0, 5).map((r) => row(esc(r.conf), `${esc(r.favorite.name)} ${pc(r.favorite.pConf)} / ${esc(r.second ? r.second.name : "")} ${r.second ? pc(r.second.pConf) : ""}`)))}
      </div>`;
    }

    async function makeDraft() {
      const st = view.querySelector("#status"); if (st) st.textContent = "Crunching the week (2,000 projected seasons and engine what-ifs)…";
      await new Promise((r) => setTimeout(r, 30));
      insights = weeklyInsights(state, core.calc, { from: fromDay, to: season.day, sims: 2000, seed: season.day * 101 });
      draft = draftArticle(insights, { week: curWeek });
      list();
    }

    function wire() {
      view.querySelectorAll("#types button").forEach((b) => b.onclick = () => { type = b.dataset.t; list(); });
      view.querySelectorAll(".article-card").forEach((a) => a.onclick = (e) => { e.preventDefault(); open = +a.dataset.i; history.pushState(null, "", `?a=${open}`); read(); });
      const d = view.querySelector("#draftBtn"); if (d) d.onclick = makeDraft;
      const r = view.querySelector("#redraft"); if (r) r.onclick = makeDraft;
      const x = view.querySelector("#discard"); if (x) x.onclick = () => { draft = null; insights = null; list(); };
      const p = view.querySelector("#publish");
      if (p) p.onclick = async () => {
        const headline = view.querySelector("#hl").value.trim(), body = view.querySelector("#body").value.trim();
        if (!headline || !body) { view.querySelector("#status").textContent = "Give it a headline and a body first."; return; }
        const a = { type: "Weekly", week: curWeek, heading: `Week ${curWeek}`, headline, body, from: fromDay, to: season.day, createdAt: new Date().toISOString() };
        setContent(state, "articles", [...state.content.articles, a]);
        await persist(); draft = null; insights = null; open = state.content.articles.length - 1; history.pushState(null, "", `?a=${open}`); read();
      };
    }

    function read() {
      const a = arts()[open];
      if (!a) { open = null; list(); return; }
      const mine = !!a.createdAt && live;
      view.innerHTML = `
        <p style="margin:0 0 12px"><a href="news.html" id="back" class="muted">&larr; All articles</a></p>
        <article class="card" style="max-width:760px">
          <span class="kicker">${esc(TYPE_LABEL[a.type] || a.type)}${a.heading ? ` &middot; ${esc(a.heading)}` : ""}${a.to ? ` &middot; through day ${a.to}` : ""}</span>
          <h1 style="font-size:clamp(1.6rem,3.5vw,2.3rem);line-height:1.1;margin:8px 0 18px">${esc(a.headline || a.heading || "")}</h1>
          <div class="prose" id="artBody">${articleHTML(a.body)}</div>
          ${mine ? `<div class="btn-row" style="margin-top:18px"><button class="btn ghost" id="edit" type="button">Edit</button><button class="btn ghost" id="del" type="button">Delete</button></div>` : ""}
        </article>`;
      view.querySelector("#back").onclick = (e) => { e.preventDefault(); open = null; history.pushState(null, "", "news.html"); list(); };
      const ed = view.querySelector("#edit");
      if (ed) ed.onclick = () => {
        const art = view.querySelector("article");
        art.innerHTML = `<div class="field" style="margin-bottom:10px"><label for="hl">Headline</label><input type="text" id="hl" value="${esc(a.headline)}"></div><div class="field"><label for="body">Body</label><textarea id="body">${esc(a.body)}</textarea></div><div class="btn-row" style="margin-top:12px"><button class="btn" id="save" type="button">Save</button><button class="btn ghost" id="cancel" type="button">Cancel</button></div>`;
        art.querySelector("#cancel").onclick = read;
        art.querySelector("#save").onclick = async () => {
          const list2 = state.content.articles.slice(); list2[open] = { ...list2[open], headline: art.querySelector("#hl").value.trim(), body: art.querySelector("#body").value.trim(), editedAt: new Date().toISOString() };
          setContent(state, "articles", list2); await persist(); read();
        };
      };
      const del = view.querySelector("#del");
      if (del) del.onclick = async () => { if (!confirm("Delete this article?")) return; setContent(state, "articles", state.content.articles.filter((_, i) => i !== open)); await persist(); open = null; history.pushState(null, "", "news.html"); list(); };
      window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", () => { const q = new URLSearchParams(location.search); open = q.has("a") ? +q.get("a") : null; open == null ? list() : read(); });
    open == null ? list() : read();
  } catch (e) { fail(view, e); }
})();
