// Custom dropdown / combobox. Replaces the native <select> so phones show our own list instead of the OS picker.
// - searchable: type to filter, arrow keys + Enter to choose, Escape to cancel, Tab accepts the top match
// - not searchable: behaves like a normal dropdown (click, arrows, Enter)
import { esc } from "./data.js";

// lowercase, strip accents/punctuation so "st louis", "St. Louis" and "saint louis-ish" all find each other
const norm = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
let uid = 0;

/**
 * @param {HTMLElement} root       empty element to render into
 * @param {object} cfg
 * @param {string} [cfg.id]        id for the inner <input> (so a <label for> works)
 * @param {{value:string,label:string,search?:string,html?:string,lead?:string}[]} cfg.options
 *        label = text shown in the box; search = extra words to match; html = rich row; lead = icon shown left of the box
 * @param {string} cfg.value       initially selected value
 * @param {(value:string, option:object)=>void} cfg.onChange
 * @param {boolean} [cfg.searchable=true]
 */
export function combobox(root, { id, options, value, onChange, searchable = true, placeholder = "Type to search" }) {
  const n = ++uid, listId = `cb-list-${n}`;
  const opts = options.map((o, i) => ({ ...o, i, _s: norm(o.search || o.label), _n: norm(o.label) }));
  let sel = opts.find((o) => o.value === value) || opts[0];
  let isOpen = false, hot = -1, shown = opts, typed = false;

  root.classList.add("cb");
  root.innerHTML = `<span class="cb-lead" aria-hidden="true"></span>
    <input class="cb-input" ${id ? `id="${esc(id)}"` : ""} type="text" role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
      aria-expanded="false" aria-controls="${listId}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"
      enterkeyhint="go" placeholder="${esc(placeholder)}" ${searchable ? "" : 'readonly inputmode="none"'}>
    <span class="cb-caret" aria-hidden="true"></span>
    <div class="cb-list" id="${listId}" role="listbox" hidden></div>`;
  const input = root.querySelector(".cb-input"), list = root.querySelector(".cb-list"), lead = root.querySelector(".cb-lead");

  function paintValue() {
    input.value = sel ? sel.label : "";
    lead.innerHTML = sel && sel.lead ? sel.lead : "";
    root.classList.toggle("has-lead", !!(sel && sel.lead));
  }

  function filter(q) {
    const toks = norm(q).split(" ").filter(Boolean);
    if (!toks.length) return opts;
    const scored = [];
    for (const o of opts) {
      if (!toks.every((t) => o._s.includes(t))) continue;
      const q1 = toks.join(" ");
      const rank = o._n.startsWith(q1) ? 0 : o._n.split(" ").some((w) => w.startsWith(toks[0])) ? 1 : 2;
      scored.push([rank, o.i, o]);
    }
    scored.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return scored.map((x) => x[2]);
  }

  function paintList() {
    if (!shown.length) { list.innerHTML = `<div class="cb-empty">No team matches that. Try fewer letters.</div>`; input.removeAttribute("aria-activedescendant"); return; }
    list.innerHTML = shown.map((o, k) =>
      `<div class="cb-opt${k === hot ? " hot" : ""}" role="option" id="cb-${n}-${o.i}" data-k="${k}" aria-selected="${o === sel}">${o.html || `<span>${esc(o.label)}</span>`}</div>`).join("");
    if (hot >= 0 && shown[hot]) {
      input.setAttribute("aria-activedescendant", `cb-${n}-${shown[hot].i}`);
      const el = list.children[hot]; if (el) el.scrollIntoView({ block: "nearest" });
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true; typed = false; shown = opts;
    hot = Math.max(0, shown.indexOf(sel));
    list.hidden = false; input.setAttribute("aria-expanded", "true");
    if (matchMedia("(max-width: 860px)").matches) {
      // phones: the on-screen keyboard covers the lower half, so bring the box to the top and open downward into the space above the keyboard
      root.classList.remove("cb-above");
      root.style.scrollMarginTop = "76px";
      root.scrollIntoView({ block: "start", behavior: "smooth" });
    } else {
      // desktop: open upward when there isn't room below
      const r = root.getBoundingClientRect();
      root.classList.toggle("cb-above", window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
    }
    paintList();
    if (searchable) input.select();
  }
  function close(revert = true) {
    if (!isOpen) return;
    isOpen = false; hot = -1; list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
    if (revert) paintValue();
  }
  function choose(o) {
    if (!o) return;
    const changed = o !== sel;
    sel = o; close(false); paintValue();
    if (searchable) input.blur();
    if (changed) onChange(o.value, o);
  }

  input.addEventListener("focus", () => { if (searchable) open(); });
  input.addEventListener("click", () => { isOpen ? (!searchable && close()) : open(); });
  root.querySelector(".cb-caret").addEventListener("mousedown", (e) => { e.preventDefault(); isOpen ? close() : (input.focus(), open()); });
  input.addEventListener("input", () => {
    if (!isOpen) open();
    typed = true; shown = filter(input.value); hot = shown.length ? 0 : -1; paintList();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) { open(); return; }
      if (!shown.length) return;
      hot = e.key === "ArrowDown" ? Math.min(shown.length - 1, hot + 1) : Math.max(0, hot - 1); paintList();
    } else if (e.key === "Enter") {
      if (isOpen) { e.preventDefault(); choose(shown[Math.max(0, hot)]); } else if (!searchable) { e.preventDefault(); open(); }
    } else if (e.key === "Escape") { if (isOpen) { e.preventDefault(); close(); } }
    else if (e.key === "Tab") { if (isOpen && typed && shown[hot]) choose(shown[hot]); else close(); }
    else if (e.key === " " && !searchable) { e.preventDefault(); isOpen ? choose(shown[Math.max(0, hot)]) : open(); }
  });
  // pick on mousedown so the input doesn't blur first (blur would close the list before the click lands)
  list.addEventListener("mousedown", (e) => { const el = e.target.closest(".cb-opt"); if (el) { e.preventDefault(); choose(shown[+el.dataset.k]); } });
  list.addEventListener("mousemove", (e) => { const el = e.target.closest(".cb-opt"); if (el && +el.dataset.k !== hot) { list.querySelector(".hot")?.classList.remove("hot"); hot = +el.dataset.k; el.classList.add("hot"); } });
  // leaving the box: typed an exact name? accept it. Otherwise put the previous choice back.
  function commit() {
    if (!isOpen) return;
    const exact = typed ? opts.find((o) => o._n === norm(input.value)) : null;
    exact ? choose(exact) : close();
  }
  input.addEventListener("blur", commit);
  document.addEventListener("pointerdown", (e) => { if (isOpen && !root.contains(e.target)) commit(); });

  paintValue();
  return {
    get value() { return sel ? sel.value : null; },
    set(v) { const o = opts.find((x) => x.value === v); if (o) { sel = o; paintValue(); if (isOpen) close(false); } },
  };
}
