// Data loading + derived structures shared by every page.

import { loadSeasonData, createState, calc, lastPlayedDay, playedCount } from "./league/league.js";
import { loadOverlay } from "./league/store.js";

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
export async function seasonsIndex() { return getJSON("seasons/index"); }
export async function activeSeasonId() {
  const idx = await seasonsIndex();
  const ids = idx.map((s) => s.id);
  const q = new URLSearchParams(location.search).get("s");
  if (q && ids.includes(q)) { try { localStorage.setItem("hw-season", q); } catch { /* ignore */ } return q; }
  try { const saved = localStorage.getItem("hw-season"); if (saved && ids.includes(saved)) return saved; } catch { /* ignore */ }
  const live = idx.find((s) => s.status === "in-progress");
  return (live || idx[idx.length - 1]).id;
}
export function setActiveSeason(id) { try { localStorage.setItem("hw-season", id); } catch { /* ignore */ } }

let LOGOS = {}; // team slug -> {f, t?} (set when a season loads)
const cores = new Map();
export function loadCore(seasonId) {
  const key = seasonId || "__active";
  if (!cores.has(key)) cores.set(key, buildCore(seasonId));
  return cores.get(key);
}
/** Drop cached cores (after the runner changes games) so pages rebuild from the saved state. */
export function resetCores() { cores.clear(); }

async function buildCore(seasonId) {
  const id = seasonId || (await activeSeasonId());
  const idx = await seasonsIndex();
  const info = idx.find((s) => s.id === id);
  const [data, overlay, logos] = await Promise.all([loadSeasonData(id, fetchJSON, info && info.files), loadOverlay(id).catch(() => null), getJSON("logos").catch(() => ({}))]);
  LOGOS = logos;
  const state = createState(data, overlay);
  const c = calc(state);
  const L = data.league;
  const nm = (i) => (i === null || i === undefined ? "—" : `#${c.teams[i].stats.rank ?? "?"} ${L[i].name}`);
  const teams = L.map((t) => {
    const r = c.teams[t.id], s = r.stats, tm = data.teams[t.id];
    return {
      id: t.id, slug: t.slug, name: t.name, conf: tm.conf, tier: tm.tier,
      gp: s.GP, w: s.W, l: s.L, cw: s.confW, cl: s.confL, home: s.home, away: s.away, neutral: s.neutral,
      pf: s.pfpg, pa: s.papg, margin: s.margin, oppRating: s.sos, sos: s.sos, rating: s.rating, tierRating: s.tierRating, eff: s.eff,
      rank: s.rank ?? 999, last10: s.last10 ?? "", streak: s.streak ?? "", bestWin: nm(s.bestWin), worstLoss: nm(s.worstLoss),
      eng: [t.name, tm.conf, ...r.live], start: tm.start, final: tm.final || null,
    };
  });
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  const games = state.games.map((g) => {
    const played = g.ptsA != null, w = played ? (g.ptsA > g.ptsB ? g.a : g.b) : null;
    return { ...g, played, w, l: played ? (w === g.a ? g.b : g.a) : null, margin: played ? Math.abs(g.ptsA - g.ptsB) : null };
  });
  const teamGames = teams.map(() => []);
  for (const g of games) if (g.a != null) { teamGames[g.a].push(g); teamGames[g.b].push(g); }
  const ncaa = data.ncaa || { field: [] };
  const seed = new Map(); for (const f of ncaa.field) seed.set(f.team, { seed: f.seed, region: f.region, ff: f.ff });
  const confs = [...new Set(teams.map((t) => t.conf))].sort((x, y) => x.localeCompare(y));
  const season = { id, label: info ? info.label : id, status: info ? info.status : "complete", day: lastPlayedDay(state), played: playedCount(state), total: state.games.length, regularSeasonDays: 42 };
  const meta = { ...(data.meta || {}), version: (data.meta && data.meta.version) || "v9" };
  const polls = (data.polls && data.polls.ap) || [];
  return { season, teams, bySlug, games, teamGames, meta, ncaa, polls, seed, confs, state, calc: c, data, overlay, league: L };
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
export const teamLink = (t) => `<a class="team-link" href="team.html?t=${t.slug}">${badge(t)}<span>${esc(t.name)}</span></a>`;
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
