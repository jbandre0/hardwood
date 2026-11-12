// App shell: rail nav, top bar with team search, theme toggle.
import { loadCore, esc, teamHref } from "./data.js";

const I = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  vs: '<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>',
  rank: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  stand: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  bracket: '<path d="M3 5h5v5H3zM3 14h5v5H3zM16 9.5h5v5h-5zM8 7.5h4v9H8M12 12h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  theme: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

const NAV = [
  ["home", "Home", "index.html", "home"],
  ["matchup", "Matchup Sim", "matchup.html", "vs"],
  ["rankings", "Rankings", "rankings.html", "rank"],
  ["standings", "Standings", "standings.html", "stand"],
  ["bracket", "March Madness", "bracket.html", "bracket"],
  ["about", "How it works", "about.html", "info"],
];

function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
export function initTheme() {
  try { applyTheme(localStorage.getItem("hw-theme")); } catch { /* storage blocked */ }
}

export function shell(page) {
  initTheme();
  const nav = NAV.map(([id, label, href, icon]) =>
    `<a href="${href}"${id === page ? ' aria-current="page"' : ""}>${svg(icon)}<span>${label}</span></a>`).join("");
  document.body.innerHTML = `
    <div class="shell">
      <aside class="rail" id="rail" aria-label="Main">
        <a class="brand" href="index.html" aria-label="Hardwood Sim home">
          <img class="brand-logo" src="assets/brand/hardwood-mark.png" alt="" width="46" height="40">
          <span class="brand-name">Hardwood<small>Sim</small></span>
        </a>
        <nav class="nav">${nav}</nav>
        <div class="rail-foot">Engine v9 &middot; 40,000 sims per matchup<br>Season 1 complete</div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menu" aria-label="Open menu">${svg("menu")}</button>
          <div class="search">
            ${svg("search")}
            <input id="q" type="search" placeholder="Search 365 teams" autocomplete="off" aria-label="Search teams">
            <div class="suggest" id="suggest" role="listbox"></div>
          </div>
          <span class="season-chip">Season 1 &middot; 2026-27</span>
          <button class="icon-btn" id="theme" aria-label="Toggle light or dark theme">${svg("theme")}</button>
        </header>
        <main id="view"><div class="skeleton" style="min-height:320px"></div></main>
      </div>
    </div>`;

  document.getElementById("menu").onclick = () => document.body.classList.toggle("nav-open");
  document.body.addEventListener("click", (e) => { if (document.body.classList.contains("nav-open") && !e.target.closest("#rail,#menu")) document.body.classList.remove("nav-open"); });
  document.getElementById("theme").onclick = () => {
    const cur = document.documentElement.dataset.theme || ("dark");
    const next = cur === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("hw-theme", next); } catch { /* ignore */ }
  };
  wireSearch();
  return document.getElementById("view");
}

async function wireSearch() {
  const q = document.getElementById("q"), box = document.getElementById("suggest");
  let core, hot = -1, items = [];
  const close = () => { box.classList.remove("open"); hot = -1; };
  const draw = () => {
    box.innerHTML = items.map((t, i) => `<a href="${teamHref(t)}" class="${i === hot ? "hot" : ""}" role="option"><span>${esc(t.name)}</span><span class="faint">${esc(t.conf)}</span></a>`).join("");
    box.classList.toggle("open", items.length > 0);
  };
  q.addEventListener("input", async () => {
    core ||= await loadCore();
    const v = q.value.trim().toLowerCase();
    items = v ? core.teams.filter((t) => t.name.toLowerCase().includes(v)).sort((a, b) => (a.name.toLowerCase().startsWith(v) ? 0 : 1) - (b.name.toLowerCase().startsWith(v) ? 0 : 1) || a.rank - b.rank).slice(0, 7) : [];
    hot = -1; draw();
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { hot = Math.min(items.length - 1, hot + 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { hot = Math.max(0, hot - 1); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && items.length) { location.href = teamHref(items[Math.max(0, hot)]); }
    else if (e.key === "Escape") close();
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) close(); });
}

export function fail(view, err) {
  console.error(err);
  view.innerHTML = `<div class="card empty"><h3>Couldn't load the data</h3><p>${esc(err.message)}</p><p class="faint">If you opened this file directly, serve the folder instead: <code>python3 -m http.server</code></p></div>`;
}
