// Watch mode: turns the engine's possession log for ONE rolled game into a broadcast: clock, scoreboard, play-by-play,
// a running win-probability estimate, runs, lead changes and the key moments. The game itself is rolled exactly like
// "Play game" (same seed -> same final score and box score); watching only changes how it's shown.
import { phi, QUICK_SD } from "./insights.js";

// outcome code -> [kind, text]. {o} = offense, {d} = defense. kind: score | miss | turnover | foul | ft
export const PLAYS = {
  1: ["ft", "{o} draws a foul and hits one at the line"],
  2: ["ft", "{o} is fouled and makes both free throws"],
  3: ["ft", "{o} is fouled but misses at the line; {d} rebounds"],
  4: ["turnover", "{o} throws it away"],
  5: ["turnover", "{o} loses the ball"],
  6: ["turnover", "{d} steals it from {o}"],
  7: ["score", "{o} hits a three"],
  8: ["miss", "{o} misses a three; {d} rebounds"],
  9: ["score", "{o} makes a jumper"],
  10: ["miss", "{o} misses a shot; {d} rebounds"],
  11: ["score", "{o} misses a three, grabs the offensive board and buries the putback three"],
  12: ["score", "{o} misses inside, gets the offensive rebound and hits a three"],
  13: ["miss", "{o} misses a three, rebounds its own miss, then misses another three; {d} gets it"],
  14: ["miss", "{o} misses inside, gets the board, fires a three and misses; {d} rebounds"],
  15: ["score", "{o} misses a three, rebounds it and scores inside"],
  16: ["score", "{o} misses, rebounds its own miss and puts it back"],
  17: ["miss", "{o} misses a three, gets the board, misses again; {d} rebounds"],
  18: ["miss", "{o} misses, gets the board, misses again; {d} rebounds"],
  19: ["score", "{o} scores in a scramble under the basket"],
  20: ["ft", "{o} gets fouled on the putback and makes both"],
  21: ["ft", "{o} gets fouled on the putback but misses at the line; {d} rebounds"],
  22: ["score", "{o} converts a three-point play off the offensive rebound"],
  23: ["ft", "{o} draws a foul on the putback, misses; {d} rebounds"],
  24: ["ft", "{o} is fouled, misses the free throws; {d} rebounds"],
  25: ["score", "{o} hits a quick three"],
  26: ["miss", "{o} misses a quick three; {d} rebounds"],
  27: ["score", "{o} scores on a quick two"],
  28: ["miss", "{o} misses a quick two; {d} rebounds"],
  29: ["turnover", "{o} commits a shot-clock violation"],
};

/** clock label for a clock value (seconds left in regulation, negative = overtime): "1H 12:34", "2H 4:05", "OT2 1:10" */
export function clockLabel(clock) {
  if (clock > 0) {
    const half = clock > 1200 ? "1H" : "2H", left = clock > 1200 ? clock - 1200 : clock;
    return `${half} ${fmt(left)}`;
  }
  const k = Math.floor(-clock / 300) + 1, left = 300 - ((-clock) - 300 * (k - 1));
  return `OT${k > 1 ? k : ""} ${fmt(Math.max(0, left))}`;
}
const fmt = (s) => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const remaining = (clock) => (clock > 0 ? clock : 300 - (((-clock) % 300) || 0));

/**
 * Win probability for team A given the score, the clock and the pre-game expected margin for A (rating gap + home edge).
 * Quick estimate: the rest of the game is Normal(expected margin x share of game left, sd x sqrt(share left)).
 */
export function winProb(diff, clock, expMargin, sd = QUICK_SD) {
  if (clock <= 0) { const rem = remaining(clock) / 300; return phi((diff + expMargin * 0.12 * rem) / Math.max(1.5, sd * 0.45 * Math.sqrt(rem))); }
  const share = clock / 2400;
  return phi((diff + expMargin * share) / Math.max(1.2, sd * Math.sqrt(share)));
}

/**
 * Build the broadcast from a rolled game.
 * @param {object} r        result of rollGame(..., {keepLog:true}): {log, ptsA, ptsB, ot, boxA, boxB}
 * @param {{A:string,B:string}} names
 * @param {number} expMargin pre-game expected margin for A (A rating - B rating + home edge)
 */
export function buildBroadcast(r, names, expMargin = 0) {
  const log = r.log;
  if (!log || !log.length) throw new Error("This game has no play log (roll it with keepLog)");
  const events = [];
  let leadChanges = 0, ties = 0, lastLeader = 0, maxLeadA = 0, maxLeadB = 0, runSide = null, runPts = 0, runStart = 0, bestRun = { A: { pts: 0 }, B: { pts: 0 } };
  let pa = 0, pb = 0;
  log.forEach((e, i) => {
    const [kind, text] = PLAYS[e.code] || ["miss", "{o} plays on"];
    const o = names[e.side], d = names[e.side === "A" ? "B" : "A"];
    const endClock = i + 1 < log.length ? log[i + 1].t : null;
    const diff = e.a - e.b, leader = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    if (e.pts && leader !== 0 && lastLeader !== 0 && leader !== lastLeader) leadChanges++;
    if (e.pts && leader === 0 && lastLeader !== 0) ties++;
    if (leader !== 0) lastLeader = leader;
    maxLeadA = Math.max(maxLeadA, diff); maxLeadB = Math.max(maxLeadB, -diff);
    // scoring runs: consecutive points by one side without the other scoring
    if (e.pts) {
      if (runSide === e.side) runPts += e.pts; else { runSide = e.side; runPts = e.pts; runStart = e.t; }
      if (runPts > bestRun[e.side].pts) bestRun[e.side] = { pts: runPts, start: runStart, end: endClock ?? e.t, idx: i };
    }
    const wp = winProb(diff, endClock ?? 0, expMargin);
    events.push({ i, t: e.t, endClock, label: clockLabel(e.t), side: e.side, code: e.code, kind, pts: e.pts, a: e.a, b: e.b, diff, text: text.replaceAll("{o}", o).replaceAll("{d}", d), wp,
      three: [7, 11, 12, 22, 25].includes(e.code), runNow: runSide === e.side ? runPts : 0, big: e.pts >= 3 || (e.pts && Math.abs(diff) <= 3 && (e.t < 150)) });
    pa = e.a; pb = e.b;
  });
  const first = { wp: winProb(0, 2400, expMargin) };
  // key moments: biggest win-probability swings, lead changes in the last five minutes, the game-winner
  const swings = events.map((e, i) => ({ i, d: Math.abs(e.wp - (i ? events[i - 1].wp : first.wp)) })).sort((x, y) => y.d - x.d).slice(0, 6).filter((x) => x.d > 0.04);
  const final = events[events.length - 1];
  const winnerSide = final.a > final.b ? "A" : "B";
  const decisive = [...events].reverse().find((e) => e.pts && ((e.a > e.b ? "A" : "B") === winnerSide) && ((e.a - e.b > 0) !== (final.a - final.b > 0) || Math.abs(e.diff) <= 3)) || final;
  return {
    events, first, final: { a: final.a, b: final.b, ot: r.ot }, winnerSide, swings, decisive: decisive.i,
    stats: { leadChanges, ties, maxLeadA, maxLeadB, bestRunA: bestRun.A.pts, bestRunB: bestRun.B.pts, possessions: events.length,
      biggestSwing: swings[0] ? { i: swings[0].i, d: swings[0].d } : null },
  };
}

/** A few lines of "what you just watched" for the final screen. */
export function storyLines(bc, names, box) {
  const s = bc.stats, w = names[bc.winnerSide], l = names[bc.winnerSide === "A" ? "B" : "A"], out = [];
  const fa = bc.final.a, fb = bc.final.b, margin = Math.abs(fa - fb);
  out.push(`${w} ${Math.max(fa, fb)}, ${l} ${Math.min(fa, fb)}${bc.final.ot ? ` (${bc.final.ot > 1 ? bc.final.ot : ""}OT)` : ""}.`);
  if (s.leadChanges) out.push(`${s.leadChanges} lead change${s.leadChanges === 1 ? "" : "s"} and ${s.ties} tie${s.ties === 1 ? "" : "s"}.`);
  else out.push(`${w} never trailed after the first basket.`);
  const bigA = names.A + " " + s.bestRunA, bigB = names.B + " " + s.bestRunB;
  out.push(`Biggest runs: ${bigA}-0${s.bestRunA >= s.bestRunB ? " (the night's best)" : ""}, ${bigB}-0${s.bestRunB > s.bestRunA ? " (the night's best)" : ""}.`);
  out.push(`Largest leads: ${names.A} ${s.maxLeadA}, ${names.B} ${s.maxLeadB}.`);
  if (margin <= 3) out.push("A one-possession game at the end. Nobody blinked.");
  else if (margin >= 25) out.push("This one was over early.");
  return out;
}
