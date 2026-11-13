// App shell: rail nav, top bar with team search, theme toggle.
import { loadCore, esc, teamHref, seasonsIndex, activeSeasonId, setActiveSeason } from "./data.js";
import { combobox } from "./combobox.js";

const I = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  vs: '<circle cx="8" cy="12" r="5"/><circle cx="16" cy="12" r="5"/>',
  rank: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  stand: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  bracket: '<path d="M3 5h5v5H3zM3 14h5v5H3zM16 9.5h5v5h-5zM8 7.5h4v9H8M12 12h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  news: '<path d="M5 4h12v16H5zM17 8h3v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4"/>',
  hist: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
  cycle: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>',
  theme: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8Z"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>`;

const NAV = [
  ["home", "Home", "index.html", "home"],
  ["matchup", "Matchup Sim", "matchup.html", "vs"],
  ["rankings", "Rankings", "rankings.html", "rank"],
  ["standings", "Standings", "standings.html", "stand"],
  ["bracketology", "Bracketology", "bracketology.html", "bracket"],
  ["bracket", "March Madness", "bracket.html", "bracket"],
  ["challenge", "Bracket Challenge", "challenge.html", "target"],
  ["news", "Articles", "news.html", "news"],
  ["stats", "Stats", "stats.html", "rank"],
  ["history", "History", "history.html", "hist"],
  ["predictions", "Predictions", "predictions.html", "target"],
  ["play", "Commissioner", "play.html", "play"],
  ["offseason", "Offseason", "offseason.html", "cycle"],
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
        <div class="rail-foot">Engine v9 &middot; 40,000 sims per matchup</div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" id="menu" aria-label="Open menu">${svg("menu")}</button>
          <div class="search">
            ${svg("search")}
            <input id="q" type="search" placeholder="Search 365 teams" autocomplete="off" aria-label="Search teams">
            <div class="suggest" id="suggest" role="listbox"></div>
          </div>
          <div class="season-pick" id="seasonPick" aria-label="Season"></div>
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
  wireSeasons();
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

async function wireSeasons() {
  loadCore().then((c) => { const f = document.querySelector(".rail-foot"); if (f) f.innerHTML = `Engine ${c.engine} &middot; 40,000 sims per matchup`; }).catch(() => {});
  const box = document.getElementById("seasonPick");
  if (!box) return;
  try {
    const [idx, cur] = await Promise.all([seasonsIndex(), activeSeasonId()]);
    combobox(box, {
      id: "seasonSel", value: cur, searchable: false, placeholder: "Season",
      options: idx.map((x) => ({ value: x.id, label: x.label + (x.status === "in-progress" ? " (live)" : ""), html: `<span>${esc(x.label)}</span><span class="sub">${x.status === "in-progress" ? "in progress" : "complete"}</span>` })),
      onChange: (v) => { setActiveSeason(v); const u = new URL(location.href); u.searchParams.delete("s"); location.href = u.pathname.endsWith("team.html") ? "index.html" : u.toString(); },
    });
  } catch { box.remove(); }
}
