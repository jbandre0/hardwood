// Plays a season state to the end in memory (fake games, nothing saved): days, field after the conference tournaments.
import { playDay, nextUnplayed, calc, setContent, syncTournament } from "../../js/league/league.js";
import { computeBoard } from "../../js/league/bracketology.js";
import { suggestField } from "../../js/league/field.js";

export const BOARD_DEFAULTS = { q1Rank: 25, q2Rank: 50, badLossRank: 100, winWeight: 8, q1Pts: 1.5, q2Pts: 0.75, badLossPts: 1.5, atLarge: 37, seedBump: 2 };
export function lockField(st) {
  const c = calc(st), teams = st.data.teams;
  const rows = computeBoard({ teams: Object.keys(teams).map((id) => ({ id: +id, conf: teams[id].conf, rating: c.teams[id].stats.rating, eff: c.teams[id].stats.eff })), games: st.games, throughDay: 47, picks: [], commAdj: [], settings: st.data.bracketology?.settings || BOARD_DEFAULTS }).rows;
  const champs = new Map(st.games.filter((g) => g.type === "CT" && g.day === 47).map((g) => [g.ctx, g.ptsA > g.ptsB ? g.a : g.b]));
  const picks = suggestField(rows, 37, champs);
  setContent(st, "field", picks.filter((p) => p.group === "Field").map((p) => ({ team: p.team, seed: p.seed, region: p.region, ff: p.ff })));
  syncTournament(st);
  return picks;
}
export function playOut(st, baseSeed = 777, untilDay = 54) {
  for (let guard = 0; guard < 80; guard++) {
    let nx = nextUnplayed(st);
    if (!nx && !st.content.field && st.games.some((g) => g.type === "CT" && g.day === 47)) { lockField(st); nx = nextUnplayed(st); }
    if (!nx || nx.day > untilDay) break;
    playDay(st, nx.day, baseSeed + nx.day);
  }
  return st;
}
