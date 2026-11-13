import { shell, fail } from "../ui.js";
import { loadCore, esc, teamLinkPlain as teamLink } from "../data.js";
import { scorecard, BACKTEST } from "../league/predictions.js";

const f3 = (x) => x.toFixed(3), p0 = (x) => `${(x * 100).toFixed(0)}%`, p1 = (x) => `${(x * 100).toFixed(1)}%`, sg = (x) => (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(1);

(async function main() {
  const view = shell("predictions");
  try {
    const core = await loadCore();
    const { state, season, teams } = core;
    const sc = scorecard(state);
    const kpis = (o) => `<div class="kpis">
      <div class="kpi"><small>Picked right</small><b>${p1(o.accuracy)}</b><span>of ${o.games.toLocaleString()} games</span></div>
      <div class="kpi"><small>Brier score</small><b>${f3(o.brier)}</b><span>0.25 = coin flip</span></div>
      <div class="kpi"><small>Log loss</small><b>${f3(o.logLoss)}</b><span>0.693 = coin flip</span></div>
      <div class="kpi"><small>Margin error</small><b>${o.marginMAE.toFixed(1)}</b><span>bias ${sg(o.marginBias)}</span></div>
      <div class="kpi"><small>Total error</small><b>${o.totalMAE.toFixed(1)}</b><span>bias ${sg(o.totalBias)} (+ = predicted high)</span></div></div>`;
    const recent = sc.rows.slice(-30).reverse();
    view.innerHTML = `
      <div class="page-title"><span class="kicker">${esc(season.label)}</span><h1>Predictions</h1>
        <p>Every game played on the Commissioner desk gets the engine's prediction locked first: win probability, margin, total, model version, the time and the exact team inputs. Locked predictions are never changed. Games imported from the workbook were played in Excel and have no locked prediction.</p></div>
      ${sc.byVersion.length ? sc.byVersion.map((v) => `
        <div class="card" style="margin-bottom:18px"><div class="card-head"><h2>Engine ${esc(v.version)}</h2><span class="muted">${v.overall.games.toLocaleString()} scored games</span></div>${kpis(v.overall)}
          <p class="faint" style="margin:12px 0 0;font-size:.82rem">Reference, ${esc(BACKTEST.label)}: ${p0(BACKTEST.accuracy)} picked right, Brier ${BACKTEST.brier}, log loss ${BACKTEST.logLoss}, margin error ${BACKTEST.marginMAE}. Tournament games between good teams are harder to call than a regular season full of mismatches, so expect the season numbers to look better.</p></div>
        <div class="grid cols-main" style="margin-bottom:18px">
          <div class="card plain"><div class="card-head"><h2>Weekly scorecard</h2></div><div class="table-wrap"><table><thead><tr><th>Week</th><th class="r">Games</th><th class="r">Right</th><th class="r">Brier</th><th class="r">Log loss</th><th class="r">Margin err</th><th class="r">Total err</th><th class="r">Total bias</th></tr></thead><tbody>
            ${v.weeks.map((w) => `<tr><td>${esc(w.week)}</td><td class="r num">${w.games}</td><td class="r num">${p0(w.accuracy)}</td><td class="r num">${f3(w.brier)}</td><td class="r num">${f3(w.logLoss)}</td><td class="r num">${w.marginMAE.toFixed(1)}</td><td class="r num">${w.totalMAE.toFixed(1)}</td><td class="r num ${Math.abs(w.totalBias) > 3 ? "down" : "muted"}">${sg(w.totalBias)}</td></tr>`).join("")}
          </tbody></table></div></div>
          <div class="card plain"><div class="card-head"><h2>Calibration</h2><span class="muted">favorite's chance vs how often it won</span></div><div class="table-wrap"><table><thead><tr><th>Favorite at</th><th class="r">Games</th><th class="r">Expected</th><th class="r">Won</th></tr></thead><tbody>
            ${v.calibration.map((b) => `<tr><td>${b.range}</td><td class="r num">${b.games}</td><td class="r num muted">${b.games ? p0(b.expected) : "—"}</td><td class="r num ${b.games >= 20 && Math.abs(b.actual - b.expected) > 0.06 ? "down" : ""}"><b>${b.games ? p0(b.actual) : "—"}</b></td></tr>`).join("")}
          </tbody></table></div><p class="faint" style="margin:10px 0 0;font-size:.8rem">Known weakness: margins spread too wide, which pulls probabilities toward 50%. If favorites keep winning more often than expected, that's it showing up.</p></div>
        </div>`).join("") : `<div class="card empty" style="margin-bottom:18px"><h3>No scored predictions yet</h3><p class="muted">${season.status === "complete" ? "This season was played before the tracker existed." : 'Play a day on the <a href="play.html" style="color:var(--accent)">Commissioner desk</a> with "Lock predictions" on, and the scorecard fills in.'}</p></div>`}
      ${recent.length ? `<div class="card plain" style="margin-bottom:18px"><div class="card-head"><h2>Latest results vs predictions</h2></div><div class="table-wrap"><table><thead><tr><th class="r">Day</th><th>Matchup</th><th class="r">P(first team)</th><th class="r">Pred. margin</th><th class="r">Final</th><th class="c">Pick</th><th class="r">Sims</th></tr></thead><tbody>
        ${recent.map((r) => `<tr><td class="r num muted">${r.day}</td><td>${teamLink(teams[r.a])} <span class="faint">${r.venue === "neutral" ? "vs" : "at"}</span> ${teamLink(teams[r.b])}</td><td class="r num">${p0(r.pA)}</td><td class="r num">${sg(r.margin)}</td><td class="r num">${r.ptsA}-${r.ptsB}</td><td class="c"><span class="res ${(r.pA >= 0.5) === r.aWon ? "W" : "L"}" style="display:inline-grid;place-items:center;width:24px;height:24px;border-radius:4px;font:800 .75rem var(--display)">${(r.pA >= 0.5) === r.aWon ? "✓" : "✗"}</span></td><td class="r num faint">${r.sims.toLocaleString()}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
      ${sc.pending.length ? `<div class="card plain"><div class="card-head"><h2>Locked, not yet played</h2><span class="muted">${sc.pending.length}</span></div><div class="table-wrap"><table><thead><tr><th class="r">Day</th><th>Matchup</th><th class="r">P(first team)</th><th class="r">Margin</th><th class="r">Total</th><th>Locked</th></tr></thead><tbody>
        ${sc.pending.slice(0, 40).map((r) => `<tr><td class="r num muted">${r.day}</td><td>${teamLink(teams[r.a])} <span class="faint">${r.venue === "neutral" ? "vs" : "at"}</span> ${teamLink(teams[r.b])}</td><td class="r num">${p0(r.pA)}</td><td class="r num">${sg(r.margin)}</td><td class="r num">${r.total.toFixed(1)}</td><td class="muted">${new Date(r.at).toLocaleString()}</td></tr>`).join("")}
      </tbody></table></div></div>` : ""}`;
  } catch (e) { fail(view, e); }
})();
