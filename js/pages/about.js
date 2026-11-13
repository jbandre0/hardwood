import { shell, fail } from "../ui.js";
import { loadCore } from "../data.js";

(async function main() {
  const view = shell("about");
  try {
    const core = await loadCore();
    const sNow = core.season;
    view.innerHTML = `
      <div class="page-title"><span class="kicker">Under the hood</span><h1>How it works</h1>
        <p>Hardwood Sim is a college basketball world built on a possession-by-possession Monte Carlo engine, originally an Excel workbook, now ported to the browser.</p></div>
      <div class="grid cols-main">
        <div class="stack">
          <div class="card prose">
            <h3 style="margin-top:0">One possession at a time</h3>
            <p>A game is up to 260 possessions on a 2,400-second clock. Each possession, the engine draws random numbers and walks a decision tree whose branch probabilities come from the two teams' stats: turnover, three-point attempt, two-point attempt, offensive rebound, foul trip, steal, shot-clock violation. Every possession ends in one of <b>29 outcomes</b>, each with a point value and a clock cost.</p>
            <h3>Both teams matter on every possession</h3>
            <p>The offense's shooting is adjusted by what the defense allows (2-point defense is trusted more than 3-point defense, because it's more repeatable). Free throws respond to both a team's ability to draw fouls and the opponent's tendency to commit them. Home court adds a boost to shooting, fewer turnovers and more free throws, about +3 points for an even matchup.</p>
            <h3>40,000 games per matchup</h3>
            <p>A prediction is the average of 40,000 simulated games, half with each team holding the opening possession. That gives win probability, expected margin and total. Playing a single game gives you one random draw from that distribution, which is why upsets happen.</p>
            <h3>How teams get their stats</h3>
            <p>Every team starts with a tier (S through F) that sets its starting stats. As games are played, a team's inputs blend toward its own simulated results over its first 10 games. Power ratings are an iterative SRS: average margin plus the average rating of opponents played, solved for all 365 teams together.</p>
          </div>
          <div class="card prose">
            <h3 style="margin-top:0">Known weaknesses</h3>
            <p>The engine is honest about where it's wrong. Margins spread a bit wide, which pulls probabilities toward 50%. It under-responds to 2-point shooting by roughly 15%. The team with the opening possession wins slightly more than it should. Totals ran about 6 points high in the real 2026 tournament backtest. Home edge is set by design, not fitted.</p>
          </div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h2>Calibration</h2></div>
            <p class="muted">Tuned so an average team plays an average team the way 2025-26 Division I actually played.</p>
            <div class="kpis" style="grid-template-columns:1fr 1fr">
              <div class="kpi"><small>Points / team</small><b>75.8</b></div><div class="kpi"><small>Possessions</small><b>69.2</b></div>
              <div class="kpi"><small>3PA share</small><b>39.6%</b></div><div class="kpi"><small>Free throws / g</small><b>20.5</b></div></div></div>
          <div class="card"><div class="card-head"><h2>Backtest</h2></div>
            <p class="muted">All 67 games of the real 2026 NCAA Tournament, simulated 40,000 times each.</p>
            <div class="kpis" style="grid-template-columns:1fr 1fr">
              <div class="kpi"><small>Picked right</small><b>76%</b></div><div class="kpi"><small>Brier score</small><b>0.164</b><span>0.25 = coin flip</span></div>
              <div class="kpi"><small>Log loss</small><b>0.493</b><span>0.693 = coin flip</span></div><div class="kpi"><small>Margin error</small><b>10.5</b></div></div></div>
          <div class="card"><div class="card-head"><h2>Engine v10: the realism ceiling</h2></div>
            <p class="muted" style="margin:0">v9 let results feed back on themselves, so a few teams drifted to lines no real team has (a rating of 46 when the best real team of 2025-26 was 33) and favorites hit 100%. v10 plays every game the same way but (1) pulls any team rated above 26 back DOWN toward a maximum of 34 (a 46 becomes about 34), and any rated below -24 back UP toward a minimum of -31, keeping its style, (2) limits every single stat to 3% past the best (or worst) any real team reached, squeezing it so it never passes 4% beyond, and (3) makes 1.5% of games "chaos" games where both teams play as one equal team, so nobody is ever better than a 99% favorite. Ordinary teams are unaffected. You can switch engines on the Commissioner desk; every game records which engine played it, and v9 results stay separate in the prediction scorecard.</p></div>
          <div class="card"><div class="card-head"><h2>Logos</h2></div>
            <p class="muted" style="margin:0">Team logos are trademarks of their schools and are shown only to identify teams in this non-commercial fan project. They come from the open <a href="https://github.com/GreenGuitar0/CBB-Team-Logos" style="color:var(--accent)">CBB-Team-Logos</a> collection. Six newer or renamed programs fall back to monogram badges.</p></div>
          <div class="card"><div class="card-head"><h2>This site</h2></div>
            <p class="muted" style="margin:0">The engine here is a JavaScript port of the workbook's Python copy, checked against it on 46 matchups (all within sampling error). Season data is imported from the Excel workbook; later games are rolled by this site with the same engine. ${sNow.label}: ${sNow.played.toLocaleString()} of ${sNow.total.toLocaleString()} scheduled games played, engine ${core.meta.version}.</p></div>
        </div>
      </div>`;
  } catch (e) { fail(view, e); }
})();
