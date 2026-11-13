// A visitor's own league starts here: Season 1 exactly as the commissioner's Season 1 began (same 365 teams,
// conferences, tiers, starting lines and schedule) with nothing played, no polls, no bracketology and no history.
// Built from the repo's season-1 files in memory and stored in the visitor's browser like any season created on the
// site (store.js saveLocalSeason), so the offseason, new seasons and everything else work the same way.
import { GAME_COLS, BOX_COLS } from "./newseason.js";

/** [key, path] of the repo files the blank season is built from (read only) */
export const FRESH_FILES = [
  ["teams", "data/seasons/season-1/teams.json"],
  ["games", "data/seasons/season-1/games.json"],
  ["settings", "data/seasons/season-1/settings.json"],
  ["bracketology", "data/seasons/season-2/bracketology.json"],   // only its Board settings (weights), never its picks
];

export const FRESH_ID = "season-1";

/** @param {{teams:object[], games:{rows:any[][]}, settings:object, bracketology?:object}} src */
export function buildFreshSeason1(src, now = new Date()) {
  const teams = src.teams.map((t) => ({ id: t.id, conf: t.conf, tier: t.tier, pos: t.pos, start: t.start.slice() }));
  // regular season and conference games only; conference tournaments and the NCAA bracket are built as the season goes
  const rows = src.games.rows.filter((r) => r[2] === "Reg" || r[2] === "Conf").map((r) => [r[0], r[1], r[2], r[3] || "", r[4], r[5], r[6], null, null]);
  const label = "Season 1";
  return {
    info: { id: FRESH_ID, label, status: "in-progress", local: true, fresh: true, createdAt: now.toISOString(), from: "fresh" },
    files: {
      teams, settings: src.settings, marquee: [],
      games: { cols: GAME_COLS, rows },
      box: { cols: BOX_COLS, rows: [] },
      polls: { ap: [], power: [] },
      bracketology: { settings: (src.bracketology && src.bracketology.settings) ? { ...src.bracketology.settings, week: 0, throughDay: 0 } : null, picks: [], articles: [], commAdj: [] },
      meta: { id: FRESH_ID, label, version: "v9", createdFrom: "fresh", scheduledGames: rows.length },
    },
  };
}
