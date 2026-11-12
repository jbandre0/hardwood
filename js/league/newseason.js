// Offseason step 5: build the next season's baseline data (teams with new tiers and starting lines, a fresh schedule,
// empty polls / bracketology) from a finished season. The result has the same shape as data/seasons/<id>/*.json, so the
// rest of the site treats it like any other season. It is stored in the browser (see store.js saveLocalSeason).
import { tierStats, seasonStart, posInTier } from "./stats.js";
import { generateSchedule, validateSchedule, pairKey } from "./schedule.js";
import { DEFAULT_OFFSEASON } from "./offseason.js";

export const BOX_COLS = ["id", "OT", "FGM A", "FGA A", "3PM A", "3PA A", "FTM A", "FTA A", "OR A", "DR A", "TO A", "ST A", "POSS A", "FGM B", "FGA B", "3PM B", "3PA B", "FTM B", "FTA B", "OR B", "DR B", "TO B", "ST B", "POSS B"];
export const GAME_COLS = ["id", "day", "type", "ctx", "a", "b", "home", "ptsA", "ptsB"];

/** marquee rows by name ({visitor, host, site: "Neutral" | "Host home", day}) -> generator input by id */
export function marqueeIds(rows, league) {
  const idOf = new Map(league.map((t) => [t.name, t.id]));
  return rows.filter((m) => m.visitor && m.host).map((m) => {
    const a = idOf.get(m.visitor), b = idOf.get(m.host);
    if (a == null) throw new Error(`Unknown team in marquee games: ${m.visitor}`);
    if (b == null) throw new Error(`Unknown team in marquee games: ${m.host}`);
    return { a, b, site: m.site === "Neutral" ? "neutral" : "host", day: m.day || undefined };
  });
}

/**
 * @param {object} o
 * @param {object} o.prev        previous season data (loadSeasonData output)
 * @param {object} o.prevState   its state (all games played)
 * @param {object} o.prevCalc    calc(prevState)
 * @param {object[]} o.review    tierReview() rows (final tier per team)
 * @param {object} o.settings    offseason settings (carry etc.)
 * @param {object[]} o.marquee   marquee rows by name
 * @param {{conference:number, nonConference:number}} o.seeds
 * @param {string} o.id, o.label
 */
export function buildNextSeason({ prev, prevState, prevCalc, review, settings = DEFAULT_OFFSEASON, marquee = [], seeds, id, label }) {
  const L = prev.league, S = prev.settings, carry = settings.carry ?? DEFAULT_OFFSEASON.carry;
  const finalTier = new Map(review.map((r) => [r.team, r.final]));
  const teams = L.map((t) => {
    const old = prev.teams[t.id], tier = finalTier.get(t.id) || old.tier;
    const last = prevCalc.teams[t.id].live;   // the season's final engine line (Sim Live at the end)
    return { id: t.id, conf: old.conf, tier, pos: posInTier(t.seed), carry, start: seasonStart(tierStats(tier, t.seed, S), last, carry), prevTier: old.tier, prevFinal: last, prevRating: prevCalc.teams[t.id].stats.rating };
  });
  const mq = marqueeIds(marquee, L);
  const schedTeams = L.map((t) => ({ id: t.id, name: t.name, conf: teams[t.id].conf }));
  const prevPairs = new Set(prevState.games.filter((g) => g.type === "Reg").map((g) => pairKey(g.a, g.b)));
  const { games, report } = generateSchedule({ teams: schedTeams, seeds, marquee: mq, prevNonConfPairs: prevPairs });
  const v = validateSchedule({ games, teams: schedTeams, prevNonConfPairs: prevPairs, marquee: mq });
  if (!v.ok) throw new Error("The generated schedule failed validation: " + v.errors.slice(0, 3).join("; "));
  return {
    info: { id, label, status: "in-progress", local: true, seed: seeds, createdAt: new Date().toISOString(), from: prev.id },
    files: {
      teams, settings: S, marquee,
      games: { cols: GAME_COLS, rows: games.map((g) => [g.id, g.day, g.type, "", g.a, g.b, g.home, null, null]) },
      box: { cols: BOX_COLS, rows: [] },
      polls: { ap: [], power: [] },
      bracketology: { settings: prev.bracketology?.settings || null, picks: [], articles: [], commAdj: [] },
      meta: { id, label, version: prev.meta?.version || "v9", createdFrom: prev.id, scheduledGames: games.length },
    },
    report: { ...report, validation: v.stats },
  };
}
