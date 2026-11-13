// Watch mode viewer: plays a broadcast (see league/watch.js) into a container, possession by possession.
import { esc, badge, apTag } from "./data.js";
import { buildBroadcast, storyLines, clockLabel } from "./league/watch.js";

const SPEEDS = [["Broadcast", 10], ["Quick", 25], ["Fast", 70], ["Blur", 400]];
const speedKey = () => { try { return localStorage.getItem("hw-watch-speed") || "Quick"; } catch { return "Quick"; } };

/**
 * @param {HTMLElement} box
 * @param {object} o  { game, A, B (team objects from loadCore), result (rolled with keepLog), expMargin, header, onFinish() -> Promise, onDone(), onNext() }
 *  onFinish runs ONCE when the last possession has been shown (or Skip is pressed): that's where the game is logged.
 */
export function startWatch(box, o) {
  const { A, B, result, game } = o, names = { A: A.name, B: B.name }, bc = buildBroadcast(result, names, o.expMargin || 0);
  const ev = bc.events, total = ev.length;
  let i = -1, paused = false, timer = null, finished = false, logging = false, speed = SPEEDS.find((s) => s[0] === speedKey()) || SPEEDS[1];
  box.dataset.watching = "1";

  box.innerHTML = `
    <div class="card-head"><h2>${esc(o.header.title)}</h2><span class="muted">${esc(o.header.sub)}</span></div>
    <div class="wv-board" role="group" aria-label="Scoreboard">
      <div class="wv-team" data-s="A">${badge(A, 44)}<div><b>${apTag(A)}${esc(A.name)}</b><span class="muted">${esc(o.records.A)}</span></div><i class="wv-ball" aria-hidden="true"></i><span class="wv-pts" id="wvA">0</span></div>
      <div class="wv-mid"><b id="wvClock" role="timer">1H 20:00</b><span id="wvState" class="muted">Tip-off</span></div>
      <div class="wv-team" data-s="B">${badge(B, 44)}<div><b>${apTag(B)}${esc(B.name)}${game.home ? ' <span class="faint" style="font-weight:500">(home)</span>' : ""}</b><span class="muted">${esc(o.records.B)}</span></div><i class="wv-ball" aria-hidden="true"></i><span class="wv-pts" id="wvB">0</span></div>
    </div>
    <svg class="wv-wp" id="wvWp" viewBox="0 0 600 84" preserveAspectRatio="none" role="img" aria-label="Win probability over the game"><line x1="0" y1="42" x2="600" y2="42" class="mid"/><path id="wvArea" d="" class="area"/><path id="wvLine" d="" class="line" fill="none"/></svg>
    <div class="wv-wplabels"><span>${esc(A.name)}</span><span id="wvWpNow" class="muted">50% (estimate)</span><span>${esc(B.name)}</span></div>
    <div class="wv-run" id="wvRun" aria-live="off"></div>
    <ol class="wv-feed" id="wvFeed" aria-label="Play by play" aria-live="off"></ol>
    <div class="wv-final" id="wvFinal" hidden></div>
    <div class="btn-row wv-controls" id="wvCtl" style="margin-top:12px">
      <button class="btn ghost" id="wvPause" type="button" title="Space">Pause</button>
      <button class="btn ghost" id="wvStep" type="button" title="Right arrow" disabled>Next play</button>
      <div class="seg" id="wvSpeed" role="group" aria-label="Speed">${SPEEDS.map(([n]) => `<button type="button" data-n="${n}" class="${n === speed[0] ? "on" : ""}">${n}</button>`).join("")}</div>
      <button class="btn ghost" id="wvSkip" type="button" title="S">Skip to final</button>
    </div>
    <p class="status" id="wvNote" aria-live="polite">Space pauses, right arrow steps, S skips. The game is logged to the season when it ends.</p>`;
  const $ = (id) => box.querySelector("#" + id);

  // ---- win probability chart (A on top). x = game time elapsed
  const span = Math.max(2400, 2400 - (ev[total - 1].endClock ?? ev[total - 1].t) + 20);
  const xAt = (e) => ((2400 - (e.endClock ?? 0)) / span) * 600, yAt = (wp) => 4 + (1 - wp) * 76;
  function chart(upto) {
    let d = `M0 ${yAt(bc.first.wp).toFixed(1)}`;
    for (let k = 0; k <= upto; k++) d += ` L${xAt(ev[k]).toFixed(1)} ${yAt(ev[k].wp).toFixed(1)}`;
    $("wvLine").setAttribute("d", d);
    const x = upto >= 0 ? xAt(ev[upto]).toFixed(1) : 0;
    $("wvArea").setAttribute("d", `${d} L${x} 42 L0 42 Z`);
  }

  function show(k) {
    const e = ev[k];
    $("wvA").textContent = e.a; $("wvB").textContent = e.b;
    $("wvClock").textContent = e.endClock == null ? "Final" : clockLabel(e.endClock);
    box.querySelectorAll(".wv-team").forEach((t) => t.classList.toggle("ball", k + 1 < total && t.dataset.s !== e.side));
    const leader = e.a === e.b ? "Tied" : `${e.a > e.b ? names.A : names.B} by ${Math.abs(e.diff)}`;
    $("wvState").textContent = leader;
    const wp = e.wp; $("wvWpNow").textContent = `${Math.round(Math.max(wp, 1 - wp) * 100)}% ${wp >= 0.5 ? names.A : names.B} (estimate)`;
    $("wvRun").textContent = e.runNow >= 8 ? `${names[e.side]} on a ${e.runNow}-0 run` : "";
    chart(k);
    const li = document.createElement("li");
    li.className = `wv-play ${e.kind} ${e.pts ? "pts" : ""} ${e.three ? "three" : ""}`;
    li.innerHTML = `<span class="clk">${esc(e.label)}</span><span class="txt">${esc(e.text)}${e.pts ? ` <b>+${e.pts}</b>` : ""}</span><span class="sc">${e.a}-${e.b}</span>`;
    const feed = $("wvFeed"); feed.prepend(li); while (feed.children.length > 14) feed.lastChild.remove();
  }

  const delayFor = (k) => {
    const e = ev[k], dur = Math.max(4, e.t - (e.endClock ?? e.t - 15));
    const base = (dur / speed[1]) * 1000;
    return Math.min(2500, Math.max(speed[0] === "Blur" ? 12 : 90, base * (e.pts >= 3 ? 1.3 : 1)));
  };
  function tick() {
    clearTimeout(timer);
    if (finished || paused) return;
    if (i + 1 >= total) return end();
    i++; show(i);
    timer = setTimeout(tick, delayFor(Math.min(i + 1, total - 1)));
  }
  async function end() {
    if (finished) return; finished = true; clearTimeout(timer);
    // show whatever remains instantly, then log the game exactly like Play game does
    while (i + 1 < total) { i++; show(i); }
    $("wvCtl").hidden = true; box.dataset.watching = "";
    $("wvClock").textContent = "Final"; $("wvState").textContent = `${names[bc.winnerSide]} wins`;
    box.querySelector(`.wv-team[data-s="${bc.winnerSide}"]`).classList.add("win");
    const f = $("wvFinal"); f.hidden = false;
    const moments = bc.swings.slice(0, 4).sort((x, y) => x.i - y.i).map((s) => ev[s.i]);
    f.innerHTML = `<p class="muted" id="wvLogState" style="margin:0 0 8px"><b>Final.</b> Logging to the season…</p>
      <ul class="wv-story">${storyLines(bc, names).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
      ${moments.length ? `<h3 style="margin:12px 0 6px">Turning points</h3><ul class="wv-story">${moments.map((m) => `<li><span class="faint">${esc(m.label)}</span> ${esc(m.text)} <span class="faint">(${m.a}-${m.b})</span></li>`).join("")}</ul>` : ""}
      <div class="btn-row" style="margin-top:12px"><button class="btn" id="wvNext" type="button" disabled title="Enter">Load next game</button><button class="btn ghost" id="wvReplay" type="button">Replay</button></div>`;
    f.querySelector("#wvReplay").onclick = () => replay();
    f.querySelector("#wvNext").onclick = () => o.onNext();
    try { logging = true; await o.onFinish(); f.querySelector("#wvLogState").innerHTML = "<b class=\"up\">Final, logged to the season.</b>"; f.querySelector("#wvNext").disabled = false; f.querySelector("#wvNext").focus(); }
    catch (err) { f.querySelector("#wvLogState").innerHTML = `<b class="down">Could not log the game: ${esc(err.message)}</b>`; }
    logging = false;
  }
  function replay() {
    // replay the broadcast without touching the (already logged) game
    i = -1; finished = false; paused = false; box.dataset.watching = "1";
    $("wvFeed").innerHTML = ""; $("wvFinal").hidden = true; $("wvCtl").hidden = false; $("wvPause").textContent = "Pause"; $("wvStep").disabled = true;
    box.querySelectorAll(".wv-team").forEach((t) => t.classList.remove("win"));
    o.onFinish = async () => {};
    tick();
  }

  $("wvPause").onclick = () => { paused = !paused; $("wvPause").textContent = paused ? "Resume" : "Pause"; $("wvStep").disabled = !paused; if (!paused) tick(); else clearTimeout(timer); };
  $("wvStep").onclick = () => { if (!paused || finished) return; if (i + 1 >= total) return end(); i++; show(i); if (i + 1 >= total) end(); };
  $("wvSkip").onclick = () => end();
  box.querySelectorAll("#wvSpeed button").forEach((b) => b.onclick = () => {
    speed = SPEEDS.find((s) => s[0] === b.dataset.n); try { localStorage.setItem("hw-watch-speed", speed[0]); } catch { /* ignore */ }
    box.querySelectorAll("#wvSpeed button").forEach((x) => x.classList.toggle("on", x === b));
  });
  const onKey = (e) => {
    if (!box.isConnected) { document.removeEventListener("keydown", onKey); return; }
    if (e.target.closest("input, textarea, [role=combobox]")) return;
    if (e.key === " " && !finished) { e.preventDefault(); $("wvPause").click(); }
    else if (e.key === "ArrowRight" && paused && !finished) { e.preventDefault(); $("wvStep").click(); }
    else if ((e.key === "s" || e.key === "S") && !finished) { e.preventDefault(); end(); }
    else if (e.key === "Enter" && finished && !logging && !e.target.closest("button")) { e.preventDefault(); o.onNext(); }
  };
  document.addEventListener("keydown", onKey);
  chart(-1);
  timer = setTimeout(tick, 700);
  return { stop() { clearTimeout(timer); finished = true; box.dataset.watching = ""; document.removeEventListener("keydown", onKey); }, broadcast: bc };
}
