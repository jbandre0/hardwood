// Data loading + derived structures shared by every page.

const cache = new Map();
export function getJSON(name) {
  if (!cache.has(name)) cache.set(name, fetch(`data/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load data/${name}.json (${r.status})`);
    return r.json();
  }));
  return cache.get(name);
}

export const ROUND_BY_DAY = { 48: "First Four", 49: "First Round", 50: "Second Round", 51: "Sweet 16", 52: "Elite Eight", 53: "Final Four", 54: "Championship" };
export const REGIONS = ["East", "West", "South", "Midwest"];

let corePromise;
let LOGOS = {}; // team slug -> logo file in assets/logos/ (set by loadCore)
export function loadCore() {
  if (!corePromise) corePromise = (async () => {
    const [teams, g, meta, ncaa, polls, logos] = await Promise.all([
      getJSON("teams"), getJSON("games"), getJSON("meta"), getJSON("ncaa"), getJSON("polls"),
      getJSON("logos").catch(() => ({})), // logos are optional: a missing map just means monogram badges
    ]);
    LOGOS = logos;
    const bySlug = new Map(teams.map((t) => [t.slug, t]));
    const games = g.rows.map((r) => {
      const [id, day, type, ctx, a, b, home, ptsA, ptsB] = r;
      const w = ptsA > ptsB ? a : b;
      return { id, day, type, ctx, a, b, home, ptsA, ptsB, w, l: w === a ? b : a, margin: Math.abs(ptsA - ptsB) };
    });
    const teamGames = teams.map(() => []);
    for (const gm of games) { teamGames[gm.a].push(gm); teamGames[gm.b].push(gm); }
    const seed = new Map(); // teamId -> {seed, region}
    for (const f of ncaa.field) seed.set(f.team, { seed: f.seed, region: f.region, ff: f.ff });
    const confs = [...new Set(teams.map((t) => t.conf))].sort((x, y) => x.localeCompare(y));
    return { teams, bySlug, games, teamGames, meta, ncaa, polls, seed, confs };
  })();
  return corePromise;
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
  for (const g of core.teamGames[teamId]) if (g.day <= day) (g.w === teamId ? w++ : l++);
  return `${w}-${l}`;
}

// one team's schedule rows from that team's point of view
export function scheduleFor(core, teamId) {
  return core.teamGames[teamId].map((g) => {
    const isA = g.a === teamId;
    const opp = isA ? g.b : g.a;
    const venue = g.home === 0 ? "N" : (isA ? "@" : "vs");
    return { g, opp, venue, us: isA ? g.ptsA : g.ptsB, them: isA ? g.ptsB : g.ptsA, won: g.w === teamId };
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
