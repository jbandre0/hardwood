// Browser storage for what the commissioner records on the site (games, polls, picks, articles...).
// IndexedDB first, localStorage as a fallback. Everything can be exported to one JSON file and restored from it.
// Nothing here ever touches the baseline data files.
const DB = "hardwood-sim", STORE = "overlays", LS = "hw-overlay-";

function openDB() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
const tx = (db, mode, fn) => new Promise((res, rej) => { const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE)); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

export async function loadOverlay(seasonId) {
  try { const db = await openDB(); const v = await tx(db, "readonly", (s) => s.get(seasonId)); db.close(); if (v) return v; } catch { /* fall through */ }
  try { const raw = localStorage.getItem(LS + seasonId); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

let asked = false;
export async function saveOverlay(seasonId, overlay) {
  if (!asked) { asked = true; protectStorage(); }
  overlay = { ...overlay, savedAt: new Date().toISOString() };
  try { const db = await openDB(); await tx(db, "readwrite", (s) => s.put(overlay, seasonId)); db.close(); return "indexeddb"; }
  catch { try { localStorage.setItem(LS + seasonId, JSON.stringify(overlay)); return "localstorage"; } catch (e) { throw new Error("Could not save to this browser: " + e.message); } }
}

export async function clearOverlay(seasonId) {
  try { const db = await openDB(); await tx(db, "readwrite", (s) => s.delete(seasonId)); db.close(); } catch { /* ignore */ }
  try { localStorage.removeItem(LS + seasonId); } catch { /* ignore */ }
}

export async function listOverlays() {
  const out = {};
  try {
    const db = await openDB();
    const keys = await tx(db, "readonly", (s) => s.getAllKeys());
    for (const k of keys) out[k] = await loadOverlay(k);
    db.close();
  } catch { /* fall through to localStorage */ }
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(LS)) { const id = k.slice(LS.length); if (!out[id]) out[id] = JSON.parse(localStorage.getItem(k)); } } } catch { /* ignore */ }
  return out;
}

/** One file with every season's browser-saved changes. */
export async function exportAll() {
  const overlays = await listOverlays();
  try { localStorage.setItem("hw-last-export", String(Date.now())); const counts = {}; for (const [id, o] of Object.entries(overlays)) if (isSeasonKey(id)) counts[id] = (o.order || []).length; localStorage.setItem("hw-last-export-counts", JSON.stringify(counts)); } catch { /* ignore */ }
  return { format: 1, app: "hardwood-sim", exportedAt: new Date().toISOString(), overlays };
}

export async function importAll(obj) {
  if (!obj || obj.app !== "hardwood-sim" || obj.format !== 1 || typeof obj.overlays !== "object") throw new Error("This is not a Hardwood Sim backup file.");
  const ids = [];
  for (const [id, o] of Object.entries(obj.overlays)) { await saveOverlay(id, o); ids.push(id); }
  return ids;
}

/** How many games are recorded in this browser that are not in the last exported backup. */
export function unsavedSince(seasonId, overlay) {
  try {
    const counts = JSON.parse(localStorage.getItem("hw-last-export-counts") || "{}");
    return Math.max(0, ((overlay && overlay.order) || []).length - (counts[seasonId] || 0));
  } catch { return ((overlay && overlay.order) || []).length; }
}

// ---------------------------------------------------------------- seasons created in this browser (offseason)
// A new season's baseline lives under the key "base:<id>"; season status changes (e.g. Season 2 closed) under
// "meta:seasons". Both travel inside exportAll()/importAll() like every other key.
const BASE = "base:", META = "meta:seasons";
export const isSeasonKey = (k) => !k.startsWith(BASE) && !k.startsWith("meta:");

export async function saveLocalSeason(info, files) { return saveOverlay(BASE + info.id, { info, files }); }
export async function loadLocalSeason(id) { return loadOverlay(BASE + id); }
export async function deleteLocalSeason(id) { await clearOverlay(BASE + id); await clearOverlay(id); const m = await seasonMeta(); m.local = m.local.filter((x) => x !== id); delete m.status[id]; await saveOverlay(META, m); }
export async function seasonMeta() {
  const m = (await loadOverlay(META)) || {};
  return { status: m.status || {}, local: m.local || [], current: m.current || null };
}
export async function updateSeasonMeta(fn) { const m = await seasonMeta(); fn(m); delete m.savedAt; await saveOverlay(META, m); return m; }

/** Ask the browser not to clear this site's storage on its own (cleanup under disk pressure, Safari's idle-site purge). */
export async function protectStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return "unsupported";
    if (await navigator.storage.persisted()) return "protected";
    return (await navigator.storage.persist()) ? "protected" : "not-protected";
  } catch { return "unsupported"; }
}
