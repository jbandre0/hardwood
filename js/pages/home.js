import { shell, fail } from "../ui.js";
import { loadCore, articleHTML, esc, badge, teamLink, teamHref, byRank, signed, recordAsOf, roundOf } from "../data.js";

(async function main() {
  const view = shell("home");
  try {
    const core = await loadCore();
    const { meta, teams, games, season } = core;
    const done = season.status === "complete";
    const played = games.filter((g) => g.played);
    const top = byRank(core).filter((t) => t.gp > 0).slice(0, 8);
    const lastPoll = core.polls[core.polls.length - 1];

    // headline numbers (regular season only)
    const reg = played.filter((g) => g.type === "Reg" || g.type === "Conf");
    const avgPts = reg.reduce((s, g) => s + g.ptsA + g.ptsB, 0) / Math.max(1, reg.length) / 2;
    const homeG = reg.filter((g) => g.home);
    const homeWins = homeG.filter((g) => g.ptsB > g.ptsA).length;
    const buzzer = played.filter((g) => g.margin <= 2).length;

    let hero, upsetsCard, reviewCard;
    if (done) {
      const champ = teams[meta.champion], runner = teams[meta.runnerUp];
      const ups = played.filter((g) => g.type === "NCAA" && g.day >= 49 && g.day <= 52).map((g) => {
        const sw = core.seed.get(g.w), sl = core.seed.get(g.l);
        return sw && sl ? { g, gap: sw.seed - sl.seed, sw: sw.seed, sl: sl.seed } : null;
      }).filter((x) => x && x.gap > 0).sort((a, b) => b.gap - a.gap || b.g.day - a.g.day).slice(0, 4);
      hero = `
        <section class="hero">
          <span class="kicker">${esc(season.label)} national champion</span>
          <div class="hero-score">
            <div class="hero-team">${badge(champ, 64)}<b>${esc(champ.name)}</b></div>
            <span class="hero-pts">${meta.finalScore[0]}</span><span class="hero-vs">DEF</span><span class="hero-pts lose">${meta.finalScore[1]}</span>
            <div class="hero-team">${badge(runner, 64)}<b>${esc(runner.name)}</b></div>
          </div>
          <p class="hero-sub">${esc(champ.name)} finished ${champ.w}-${champ.l}, survived a one-point Elite Eight against Purdue, and cut down the nets in the first season of Hardwood Sim. 365 teams, ${season.total.toLocaleString()} games, one possession at a time.</p>
          <div class="btn-row"><a class="btn warm" href="matchup.html?a=${champ.slug}&b=${runner.slug}">Run it back</a><a class="btn ghost" style="color:#FFF4E6;border-color:rgba(255,244,230,.4)" href="bracket.html">See the bracket</a></div>
        </section>`;
      upsetsCard = `
          <div class="card plain">
            <div class="card-head"><h2>Tournament upsets</h2><a href="bracket.html">Bracket</a></div>
            <div class="table-wrap"><table><thead><tr><th>Round</th><th>Winner</th><th>Loser</th><th class="r">Score</th></tr></thead><tbody>
              ${ups.map(({ g, sw, sl }) => `<tr><td class="muted">${esc(roundOf(g))}</td><td><span class="pill warm">${sw}</span> ${teamLink(teams[g.w])}</td><td><span class="pill">${sl}</span> ${teamLink(teams[g.l])}</td><td class="r num">${Math.max(g.ptsA, g.ptsB)}-${Math.min(g.ptsA, g.ptsB)}</td></tr>`).join("")}
            </tbody></table></div>
          </div>`;
      const art = meta.article || {};
      reviewCard = art.body ? `
      <div class="card" style="margin-top:18px">
        <div class="card-head"><h2>${esc((art.headline || "The season in review").split(":")[0])}</h2><span class="pill mint">Bracketology HQ</span></div>
        <div class="prose wide">${articleHTML(art.body, 7)}</div>
        <a class="btn ghost" href="bracket.html#review">Read the full review</a>
      </div>` : "";
    } else {
      const lead = top[0], nxt = games.filter((g) => !g.played && g.a != null)[0];
      const left = games.filter((g) => !g.played && g.type !== "CT" && g.type !== "NCAA").length;
      // biggest upsets on the most recent days: lower-rated team won
      const recent = played.filter((g) => g.day >= season.day - 2 && (g.type === "Reg" || g.type === "Conf"))
        .map((g) => ({ g, gap: teams[g.l].rating - teams[g.w].rating })).filter((x) => x.gap > 0).sort((a, b) => b.gap - a.gap).slice(0, 5);
      hero = `
        <section class="hero">
          <span class="kicker">${esc(season.label)} &middot; day ${season.day} of ${season.regularSeasonDays} regular-season days</span>
          <div class="hero-score">
            ${lead ? `<div class="hero-team">${badge(lead, 64)}<b>${esc(lead.name)}</b></div><span class="hero-pts">${lead.rating.toFixed(1)}</span><span class="hero-vs">RATING</span><span class="hero-pts lose">${lead.w}-${lead.l}</span>` : ""}
          </div>
          <p class="hero-sub">${lead ? `${esc(lead.name)} leads the power ratings.` : ""} ${season.played.toLocaleString()} games are in the books, ${left.toLocaleString()} regular-season games to go${nxt ? `, with day ${nxt.day} up next` : ""}.</p>
          <div class="btn-row"><a class="btn warm" href="play.html">Commissioner desk</a><a class="btn ghost" style="color:#FFF4E6;border-color:rgba(255,244,230,.4)" href="rankings.html">Power rankings</a></div>
        </section>`;
      upsetsCard = `
          <div class="card plain">
            <div class="card-head"><h2>Recent upsets</h2><a href="rankings.html">Rankings</a></div>
            ${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Day</th><th>Winner</th><th>Loser</th><th class="r">Score</th><th class="r">Rating gap</th></tr></thead><tbody>
              ${recent.map(({ g, gap }) => `<tr><td class="muted num">${g.day}</td><td>${teamLink(teams[g.w])}</td><td>${teamLink(teams[g.l])}</td><td class="r num">${Math.max(g.ptsA, g.ptsB)}-${Math.min(g.ptsA, g.ptsB)}</td><td class="r num up">${gap.toFixed(1)}</td></tr>`).join("")}
            </tbody></table></div>` : `<p class="muted">No upsets yet on the latest days.</p>`}
          </div>`;
      const arts = (core.data.bracketology && core.data.bracketology.articles) || [];
      const art = arts[arts.length - 1];
      reviewCard = art ? `
      <div class="card" style="margin-top:18px">
        <div class="card-head"><h2>${esc((art.headline || "Bracketology").split(":")[0])}</h2><span class="pill mint">Week ${esc(art.week)}</span></div>
        <p class="muted" style="margin-top:-6px">${esc(art.headline || "")}</p>
        <div class="prose wide">${articleHTML(art.body, 7)}</div>
        <a class="btn ghost" href="bracketology.html">Bracketology</a>
      </div>` : "";
    }

    view.innerHTML = `
      ${hero}
      <div class="kpis" style="margin-top:18px">
        <div class="kpi"><small>Games played</small><b>${played.length.toLocaleString()}</b><span>${done ? `${reg.length.toLocaleString()} regular season, ${played.length - reg.length} postseason` : `of ${season.total.toLocaleString()} scheduled`}</span></div>
        <div class="kpi"><small>Home teams won</small><b>${homeG.length ? ((homeWins / homeG.length) * 100).toFixed(1) : "—"}%</b><span>of ${homeG.length.toLocaleString()}, built in at about +3.0 points</span></div>
        <div class="kpi"><small>Decided by 2 or less</small><b>${buzzer}</b><span>average team scored ${avgPts.toFixed(1)}</span></div>
      </div>

      <div class="grid cols-main" style="margin-top:18px">
        <div class="stack">
          <div class="card plain">
            <div class="card-head"><h2>Power rankings</h2><a href="rankings.html">Full rankings</a></div>
            <div class="table-wrap"><table><thead><tr><th>#</th><th>Team</th><th>Conf</th><th class="r">Record</th><th class="r">Rating</th></tr></thead><tbody>
              ${top.map((t) => `<tr><td class="rank">${t.rank}</td><td>${teamLink(t)}</td><td class="muted">${esc(t.conf)}</td><td class="r num">${t.w}-${t.l}</td><td class="r num"><b>${t.rating.toFixed(1)}</b></td></tr>`).join("")}
            </tbody></table></div>
          </div>
          ${upsetsCard}
        </div>
        <div class="stack">
          ${lastPoll ? `<div class="card plain">
            <div class="card-head"><h2>${done ? "Final " : "Latest "}AP Top 10</h2><a href="rankings.html#ap">Top 25</a></div>
            <div class="table-wrap"><table><tbody>
              ${lastPoll.ranks.slice(0, 10).map((id, i) => { const t = teams[id]; return `<tr><td class="rank">${i + 1}</td><td>${teamLink(t)}</td><td class="r num muted">${recordAsOf(core, id, lastPoll.afterDay)}</td></tr>`; }).join("")}
            </tbody></table></div>
          </div>` : ""}
          <div class="card">
            <div class="card-head"><h2>Sim anything</h2></div>
            <p class="muted">Dream matchups, revenge games, a 365th-ranked team against the leaders. Pick two teams and the engine plays 40,000 games${done ? "" : " using each team's current inputs"}.</p>
            <a class="btn" href="matchup.html">Open the matchup sim</a>
          </div>
        </div>
      </div>
      ${reviewCard}`;
  } catch (e) { fail(view, e); }
})();
