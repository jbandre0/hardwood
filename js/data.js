// Data loading + derived structures shared by every page.

import { loadSeasonData, createState, calc, lastPlayedDay, playedCount, engineRow, engineVersion } from "./league/league.js";
import { loadOverlay, seasonMeta, loadLocalSeason, leagueMode, modeKey, saveLocalSeason, updateSeasonMeta } from "./league/store.js";
import { buildFreshSeason1, FRESH_FILES } from "./league/fresh.js";

const cache = new Map();
export function fetchJSON(path) {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => {
    if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
    return r.json();
  }));
  return cache.get(path);
}
export const getJSON = (name) => fetchJSON(`data/${name}.json`);

export const ROUND_BY_DAY = { 48: "First Four", 49: "First Round", 50: "Second Round", 51: "Sweet 16", 52: "Elite Eight", 53: "Final Four", 54: "Championship" };
export const REGIONS = ["East", "West", "South", "Midwest"];

// ---------- which season are we looking at? ----------
let idxPromise = null;
/** Static seasons (data/seasons/index.json) plus seasons created in this browser, with status changes applied. */
export function seasonsIndex() {
  if (!idxPromise) idxPromise = (async () => {
    const mode = await leagueMode();
    // a visitor's own league has no repo seasons: only what was created in this browser, starting with a blank Season 1
    const base = mode === "mine" ? [] : (await getJSON("seasons/index")).map((s) => ({ ...s }));
    let meta = { status: {}, local: [] };
    try { meta = await seasonMeta(); } catch { /* storage blocked */ }
    if (mode === "mine" && !meta.local.length) { await ensureFreshLeague(); meta = await seasonMeta(); }
    for (const id of meta.local) {
      try { const b = await loadLocalSeason(id); if (b && b.info) base.push({ ...b.info, files: Object.keys(b.files) }); } catch { /* ignore */ }
    }
    for (const s of base) if (meta.status[s.id]) s.status = meta.status[s.id];
    return base;
  })();
  return idxPromise;
}
export function resetSeasonsIndex() { idxPromise = null; }

/** Create the blank Season 1 of a visitor's own league (once). The repo files are only read, never changed. */
async function ensureFreshLeague() {
  const files = Object.fromEntries(await Promise.all(FRESH_FILES.map(async ([k, path]) => [k, await fetchJSON(path)])));
  const { info, files: out } = buildFreshSeason1(files);
  await saveLocalSeason(info, out);
  await updateSeasonMeta((m) => { if (!m.local.includes(info.id)) m.local.push(info.id); m.current = info.id; });
}
export async function activeSeasonId() {
  const idx = await seasonsIndex();
  const ids = idx.map((s) => s.id);
  const q = new URLSearchParams(location.search).get("s");
  if (q && ids.includes(q)) { try { localStorage.setItem(modeKey("season"), q); } catch { /* ignore */ } return q; }
  try { const saved = localStorage.getItem(modeKey("season")); if (saved && ids.includes(saved)) return saved; } catch { /* ignore */ }
  const live = [...idx].reverse().find((s) => s.status === "in-progress");
  return (live || idx[idx.length - 1]).id;
}
export function setActiveSeason(id) { try { localStorage.setItem(modeKey("season"), id); } catch { /* ignore */ } }

let LOGOS = {}; // team slug -> {f, t?} (set when a season loads)
const cores = new Map();
export function loadCore(seasonId) {
  const key = seasonId || "__active";
  if (!cores.has(key)) cores.set(key, buildCore(seasonId));
  return cores.get(key);
}
/** Drop cached cores (after the runner changes games) so pages rebuild from the saved state. */
export function resetCores() { cores.clear(); idxPromise = null; }

async function buildCore(seasonId) {
  const id = seasonId || (await activeSeasonId());
  const idx = await seasonsIndex();
  const info = idx.find((s) => s.id === id);
  let loader = fetchJSON;
  if (info && info.local) {
    const b = await loadLocalSeason(id);
    if (!b) throw new Error(`${info.label} is missing from this browser's storage. Restore it from a backup file on the Commissioner desk.`);
    const own = (await leagueMode()) === "mine";
    // a visitor's league never picks up the commissioner's published editions or bracket-challenge entry
    loader = (p) => (p.startsWith(`data/seasons/${id}/`) ? Promise.resolve(b.files[p.slice(`data/seasons/${id}/`.length, -5)] ?? Promise.reject(new Error("missing")))
      : own && (p === "data/editions.json" || p === "data/challenge.json") ? Promise.resolve({}) : fetchJSON(p));
  }
  const [data, overlay, logos] = await Promise.all([loadSeasonData(id, loader, info && info.files), loadOverlay(id).catch(() => null), getJSON("logos").catch(() => ({}))]);
  LOGOS = logos;
  const state = createState(data, overlay);
  const c = calc(state);
  const L = data.league;
  const nm = (i) => (i === null || i === undefined ? "—" : `#${c.teams[i].stats.rank ?? "?"} ${L[i].name}`);
  const lastAp = state.content.ap[state.content.ap.length - 1], apOf = new Map(lastAp ? lastAp.ranks.map((id, i) => [id, i + 1]) : []);
  const teams = L.map((t) => {
    const r = c.teams[t.id], s = r.stats, tm = data.teams[t.id];
    return {
      id: t.id, slug: t.slug, name: t.name, ap: apOf.get(t.id) ?? null, conf: tm.conf, tier: tm.tier,
      gp: s.GP, w: s.W, l: s.L, cw: s.confW, cl: s.confL, home: s.home, away: s.away, neutral: s.neutral,
      pf: s.pfpg, pa: s.papg, margin: s.margin, oppRating: s.sos, sos: s.sos, rating: s.rating, tierRating: s.tierRating, eff: s.eff,
      rank: s.rank ?? 999, last10: s.last10 ?? "", streak: s.streak ?? "", bestWin: nm(s.bestWin), worstLoss: nm(s.worstLoss),
      eng: [t.name, tm.conf, ...r.live], effEng: engineRow(state, c, t.id), start: tm.start, final: tm.final || null, prevRating: tm.prevRating ?? null,
    };
  });
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const games = state.games.map((g) => {
    const played = g.ptsA != null, w = played ? (g.ptsA > g.ptsB ? g.a : g.b) : null;
    return { ...g, played, w, l: played ? (w === g.a ? g.b : g.a) : null, margin: played ? Math.abs(g.ptsA - g.ptsB) : null };
  });
  const teamGames = teams.map(() => []);
  for (const g of games) if (g.a != null) { teamGames[g.a].push(g); teamGames[g.b].push(g); }
  const ncaa = { ...(data.ncaa || {}), field: state.content.field || (data.ncaa && data.ncaa.field) || [] };
  const seed = new Map(); for (const f of ncaa.field) seed.set(f.team, { seed: f.seed, region: f.region, ff: f.ff });
  const confs = [...new Set(teams.map((t) => t.conf))].sort((x, y) => x.localeCompare(y));
  const season = { id, label: info ? info.label : id, status: info ? info.status : "complete", day: lastPlayedDay(state), played: playedCount(state), total: state.games.length, regularSeasonDays: 42 };
  const meta = { ...(data.meta || {}), version: (data.meta && data.meta.version) || "v9" };
  const polls = state.content.ap;
  return { season, teams, bySlug, games, teamGames, meta, ncaa, polls, seed, confs, state, calc: c, data, overlay, league: L, engine: engineVersion(state) };
}

// ---------- formatting ----------
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const pct = (p, d = 0) => (p * 100).toFixed(d) + "%";
export const signed = (n, d = 1) => (n > 0 ? "+" : n < 0 ? "−" : "") + Math.abs(n).toFixed(d);
export const rec = (t) => `${t.w}-${t.l}`;

export function initials(name) {
  const parts = name.replace(/[()'.]/g, "").split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 3);
  return parts.slice(0, 3).map((p) => p[0]).join("");
}
// Team badge: the school's logo when we have one, otherwise a monogram disc ringed by tier.
// If a logo file fails to load, the <img> swaps itself for the monogram.
export const badge = (t, size) => {
  const style = size ? ` style="--s:${size}px"` : "";
  const mono = initials(t.name);
  const lg = LOGOS[t.slug];
  if (lg) {
    return `<span class="badge logo t-${esc(t.tier)}"${style}${lg.t ? ` data-tone="${lg.t}"` : ""} aria-hidden="true"><img src="assets/logos/${esc(lg.f)}" alt="" width="${size || 34}" height="${size || 34}" loading="lazy" decoding="async" onerror="this.parentNode.classList.remove('logo');this.replaceWith(document.createTextNode('${esc(mono)}'))"></span>`;
  }
  return `<span class="badge t-${esc(t.tier)}"${style} aria-hidden="true">${esc(mono)}</span>`;
};
/** the team's rank in the latest AP ballot as html ("#11") or nothing */
export const apTag = (t) => (t && t.ap ? `<i class="ap-tag" title="AP rank">#${t.ap}</i> ` : "");
/** plain-text name with the AP rank in front ("#11 Baylor") */
export const apName = (t) => (t.ap ? `#${t.ap} ` : "") + t.name;
/** a linked team; the latest AP rank rides along unless { ap: false } (history pages, past results, the AP table itself) */
export const teamLink = (t, opts = {}) => `<a class="team-link" href="team.html?t=${t.slug}">${badge(t)}<span>${opts.ap === false ? "" : apTag(t)}${esc(t.name)}</span></a>`;
export const teamLinkPlain = (t) => teamLink(t, { ap: false });
export const teamHref = (t) => `team.html?t=${t.slug}`;

export function roundOf(g) {
  if (g.type === "NCAA") return ROUND_BY_DAY[g.day] || g.ctx;
  if (g.type === "CT") return "Conference Tournament";
  return g.type === "Conf" ? "Conference" : "Non-conference";
}

// record as of a given day (inclusive), across all game types
export function recordAsOf(core, teamId, day) {
  let w = 0, l = 0;
  for (const g of core.teamGames[teamId]) if (g.played && g.day <= day) (g.w === teamId ? w++ : l++);
  return `${w}-${l}`;
}

// one team's schedule rows from that team's point of view
export function scheduleFor(core, teamId) {
  return core.teamGames[teamId].map((g) => {
    const isA = g.a === teamId;
    const opp = isA ? g.b : g.a;
    const venue = g.home === 0 ? "N" : (isA ? "@" : "vs");
    return { g, opp, venue, us: isA ? g.ptsA : g.ptsB, them: isA ? g.ptsB : g.ptsA, won: g.played ? g.w === teamId : null, played: g.played };
  }).sort((x, y) => x.g.day - y.g.day || x.g.id - y.g.id);
}

// season-1 final power order = teams sorted by `rank`
export const byRank = (core) => [...core.teams].sort((x, y) => x.rank - y.rank);

// Turn the exported review text into HTML: ALL-CAPS first lines become headings.
export function articleHTML(body, maxParas = Infinity) {
  const title = (s) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const out = [];
  for (const block of (body || "").split(/\n\n+/).map((b) => b.trim()).filter(Boolean)) {
    const [first, ...rest] = block.split("\n");
    if (/^[A-Z0-9 ,'&.-]{5,}$/.test(first.trim()) && (rest.length || block === first)) {
      out.push(`<h3>${esc(title(first.trim()))}</h3>`);
      if (rest.length) out.push(`<p>${esc(rest.join(" "))}</p>`);
    } else out.push(`<p>${esc(block)}</p>`);
  }
  return out.slice(0, maxParas).join("");
}

/** Every season (static and browser-made) with its archive summary, for the history pages. Seasons load in parallel. */
export async function loadAllSeasons() {
  const { seasonSummary } = await import("./league/summary.js");
  const idx = await seasonsIndex();
  const cores = await Promise.all(idx.map((s) => loadCore(s.id).catch(() => null)));
  return idx.map((s, i) => {
    const c = cores[i]; if (!c) return null;
    return { id: s.id, label: s.label, status: s.status, core: c, games: c.state.games, summary: seasonSummary(c.state, c.calc, c.league, c.ncaa.field) };
  }).filter(Boolean);
}
