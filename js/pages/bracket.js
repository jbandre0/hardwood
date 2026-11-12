import { shell, fail } from "../ui.js";
import { loadCore, articleHTML, esc, badge, teamHref, ROUND_BY_DAY } from "../data.js";

// standard bracket order of R64 matchups inside a region (by seed pairs)
const PAIRS = [[1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15]];
const LABELS = ["First Round", "Second Round", "Sweet 16", "Elite Eight"];

(async function main() {
  const view = shell("bracket");
  try {
    const core = await loadCore();
    const { teams, games, seed } = core;
    const ncaa = games.filter((g) => g.type === "NCAA");
    const seedOf = (id) => seed.get(id)?.seed ?? "";

    const team = (id, pts, win, upset) => {
      const t = teams[id];
      return `<a class="tm ${win ? "win" : "lose"} ${upset ? "upset" : ""}" href="${teamHref(t)}"><span class="sd">${seedOf(id)}</span><span class="nm">${esc(t.name)}</span><span class="pts">${pts ?? ""}</span></a>`;
    };
    const gameBox = (g) => {
      if (!g) return `<div class="game"><div class="tm"><span class="sd"></span><span class="nm faint">TBD</span><span class="pts"></span></div><div class="tm"><span class="sd"></span><span class="nm faint">TBD</span><span class="pts"></span></div></div>`;
      const up = seedOf(g.w) > seedOf(g.l);
      return `<div class="game" title="Day ${g.day} · ${esc(ROUND_BY_DAY[g.day])}">${team(g.a, g.ptsA, g.w === g.a, g.w === g.a && up)}${team(g.b, g.ptsB, g.w === g.b, g.w === g.b && up)}</div>`;
    };

    function regionHTML(R, flip) {
      const rg = ncaa.filter((g) => g.ctx === R && g.day >= 49 && g.day <= 52);
      const r64 = rg.filter((g) => g.day === 49);
      // slot of each team = index of its R64 game in standard order
      const slotOf = new Map();
      const slots = Array(8).fill(null);
      for (const g of r64) {
        const s1 = seedOf(g.a), s2 = seedOf(g.b);
        const k = PAIRS.findIndex(([x, y]) => (x === s1 && y === s2) || (x === s2 && y === s1));
        if (k >= 0) { slots[k] = g; slotOf.set(g.a, k); slotOf.set(g.b, k); }
      }
      const cols = [slots];
      for (const [day, per] of [[50, 4], [51, 2], [52, 1]]) {
        const arr = Array(per).fill(null), size = 8 / per;
        for (const g of rg.filter((x) => x.day === day)) arr[Math.floor(slotOf.get(g.a) / size)] = g;
        cols.push(arr);
      }
      const colHTML = cols.map((arr, ci) => {
        const boxes = arr.map(gameBox);
        if (ci === 3) return `<div class="round">${boxes.join("")}</div>`;
        const pairs = [];
        for (let i = 0; i < boxes.length; i += 2) pairs.push(`<div class="pair">${boxes[i]}${boxes[i + 1]}</div>`);
        return `<div class="round">${pairs.join("")}</div>`;
      }).join("");
      const firstWinner = cols[3][0] ? teams[cols[3][0].w] : null;
      return `<section class="region ${flip ? "flip" : ""}" aria-label="${R} region">
        <div class="region-title"><h2>${R}</h2>${firstWinner ? `<span class="pill mint">Regional champ: ${esc(firstWinner.name)}</span>` : ""}</div>
        ${LABELS.map((l) => `<div class="round-label">${l}</div>`).join("")}${colHTML}</section>`;
    }

    // Final Four + championship
    const ff = ncaa.filter((g) => g.day === 53), title = ncaa.find((g) => g.day === 54);
    const regionOf = (id) => seed.get(id)?.region;
    const semi = (g) => `<div><div class="round-label" style="margin-bottom:6px">${regionOf(g.a)} vs ${regionOf(g.b)}</div>${gameBox(g)}</div>`;
    const champ = title ? teams[title.w] : null;
    const first4 = ncaa.filter((g) => g.day === 48);

    // narrative review
    const review = articleHTML(core.meta.article.body);

    view.innerHTML = `
      <div class="page-title"><span class="kicker">Season 1 &middot; Days 48&ndash;54</span><h1>March Madness</h1>
        <p>Sixty-eight teams, seven days, one net. Peach seed numbers mark upsets. Scroll sideways on a phone.</p></div>
      <div class="card" style="margin-bottom:18px;padding:22px 18px">
        <div class="bracket-scroll"><div class="bracket">
          ${regionHTML("East", false)}${regionHTML("West", true)}
          <div class="ff-center">
            ${ff[0] ? semi(ff[0]) : "<div></div>"}
            <div class="champ-card"><div class="crown">National champion</div>${champ ? `${badge(champ, 64)}<h2>${esc(champ.name)}</h2><div class="muted" style="color:rgba(255,244,230,.8)">${champ.w}-${champ.l}</div>` : "<h2>TBD</h2>"}
              <div style="margin-top:14px">${gameBox(title)}</div></div>
            ${ff[1] ? semi(ff[1]) : "<div></div>"}
          </div>
          ${regionHTML("South", false)}${regionHTML("Midwest", true)}
        </div></div>
      </div>
      <div class="card" style="margin-bottom:18px">
        <div class="card-head"><h2>First Four</h2><span class="muted">Day 48 &middot; Dayton</span></div>
        <div class="grid cols-2" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${first4.map(gameBox).join("")}</div>
      </div>
      <div class="card" id="review">
        <div class="card-head"><h2>${esc((core.meta.article.headline || "Tournament in review").split(":")[0])}</h2><span class="pill mint">Bracketology HQ</span></div>
        <p class="muted" style="margin-top:-6px">${esc(core.meta.article.headline || "")}</p>
        <div class="prose">${review}</div>
      </div>`;
    if (location.hash === "#review") document.getElementById("review").scrollIntoView();
  } catch (e) { fail(view, e); }
})();
