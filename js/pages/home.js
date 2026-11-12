import { shell, fail } from "../ui.js";
import { loadCore, articleHTML, esc, badge, teamLink, teamHref, byRank, signed, recordAsOf, roundOf } from "../data.js";

(async function main() {
  const view = shell("home");
  try {
    const core = await loadCore();
    const { meta, teams, games } = core;
    const champ = teams[meta.champion], runner = teams[meta.runnerUp];
    const top = byRank(core).slice(0, 8);
    const title = games[games.length - 1];
    const lastPoll = core.polls[core.polls.length - 1];

    // headline numbers
    const reg = games.filter((g) => g.type === "Reg" || g.type === "Conf");
    const avgPts = reg.reduce((s, g) => s + g.ptsA + g.ptsB, 0) / reg.length / 2;
    const homeWins = games.filter((g) => g.home && (g.type === "Reg" || g.type === "Conf")).filter((g) => g.ptsB > g.ptsA).length;
    const homeGames = games.filter((g) => g.home && (g.type === "Reg" || g.type === "Conf")).length;
    const buzzer = games.filter((g) => g.margin <= 2).length;

    // biggest NCAA upsets by seed gap
    const ups = games.filter((g) => g.type === "NCAA" && g.day >= 49 && g.day <= 52).map((g) => {
      const sw = core.seed.get(g.w), sl = core.seed.get(g.l);
      return sw && sl ? { g, gap: sw.seed - sl.seed, sw: sw.seed, sl: sl.seed } : null;
    }).filter((x) => x && x.gap > 0).sort((a, b) => b.gap - a.gap || b.g.day - a.g.day).slice(0, 4);

    // closest games of the tournament + most lopsided regular season
    const blowout = [...reg].sort((a, b) => b.margin - a.margin)[0];

    const headlineParts = (meta.article.headline || "").split(":");
    view.innerHTML = `
      <section class="hero">
        <span class="kicker">Season 1 national champion</span>
        <div class="hero-score">
          <div class="hero-team">${badge(champ, 64)}<b>${esc(champ.name)}</b></div>
          <span class="hero-pts">${meta.finalScore[0]}</span><span class="hero-vs">DEF</span><span class="hero-pts lose">${meta.finalScore[1]}</span>
          <div class="hero-team">${badge(runner, 64)}<b>${esc(runner.name)}</b></div>
        </div>
        <p class="hero-sub">${esc(champ.name)} finished ${champ.w}-${champ.l}, survived a one-point Elite Eight against Purdue, and cut down the nets in the first season of Hardwood Sim. 365 teams, 5,876 games, one possession at a time.</p>
        <div class="btn-row"><a class="btn warm" href="matchup.html?a=${champ.slug}&b=${runner.slug}">Run it back</a><a class="btn ghost" style="color:#FFF4E6;border-color:rgba(255,244,230,.4)" href="bracket.html">See the bracket</a></div>
      </section>

      <div class="kpis" style="margin-top:18px">
        <div class="kpi"><small>Games played</small><b>${games.length.toLocaleString()}</b><span>${reg.length.toLocaleString()} regular season, ${games.length - reg.length} postseason</span></div>
        <div class="kpi"><small>Home teams won</small><b>${((homeWins / homeGames) * 100).toFixed(1)}%</b><span>of ${homeGames.toLocaleString()}, built in at about +3.0 points</span></div>
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
          <div class="card plain">
            <div class="card-head"><h2>Tournament upsets</h2><a href="bracket.html">Bracket</a></div>
            <div class="table-wrap"><table><thead><tr><th>Round</th><th>Winner</th><th>Loser</th><th class="r">Score</th></tr></thead><tbody>
              ${ups.map(({ g, sw, sl }) => `<tr><td class="muted">${esc(roundOf(g))}</td><td><span class="pill warm">${sw}</span> ${teamLink(teams[g.w])}</td><td><span class="pill">${sl}</span> ${teamLink(teams[g.l])}</td><td class="r num">${Math.max(g.ptsA, g.ptsB)}-${Math.min(g.ptsA, g.ptsB)}</td></tr>`).join("")}
            </tbody></table></div>
          </div>
        </div>
        <div class="stack">
          <div class="card plain">
            <div class="card-head"><h2>Final AP Top 10</h2><a href="rankings.html#ap">Top 25</a></div>
            <div class="table-wrap"><table><tbody>
              ${lastPoll.ranks.slice(0, 10).map((id, i) => { const t = teams[id]; return `<tr><td class="rank">${i + 1}</td><td>${teamLink(t)}</td><td class="r num muted">${recordAsOf(core, id, lastPoll.afterDay)}</td></tr>`; }).join("")}
            </tbody></table></div>
          </div>
          <div class="card">
            <div class="card-head"><h2>Sim anything</h2></div>
            <p class="muted">Dream matchups, revenge games, a 365th-ranked team against the champs. Pick two teams and the engine plays 40,000 games.</p>
            <a class="btn" href="matchup.html">Open the matchup sim</a>
          </div>
          <div class="card">
            <div class="card-head"><h2>Biggest blowout</h2></div>
            <p style="margin:0">${teamLink(teams[blowout.w])}<span class="faint"> beat </span>${teamLink(teams[blowout.l])}</p>
            <div class="display" style="font-size:2.2rem;margin-top:10px">${Math.max(blowout.ptsA, blowout.ptsB)}-${Math.min(blowout.ptsA, blowout.ptsB)}<span class="faint" style="font-size:1rem;margin-left:10px">Day ${blowout.day}</span></div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:18px">
        <div class="card-head"><h2>${esc(headlineParts[0] || "The season in review")}</h2><span class="pill mint">Bracketology HQ</span></div>
        <div class="prose wide">${articleHTML(meta.article.body, 7)}</div>
        <a class="btn ghost" href="bracket.html#review">Read the full review</a>
      </div>`;
  } catch (e) { fail(view, e); }
})();
