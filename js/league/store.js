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

export async function saveOverlay(seasonId, overlay) {
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
  try { localStorage.setItem("hw-last-export", String(Date.now())); const counts = {}; for (const [id, o] of Object.entries(overlays)) counts[id] = (o.order || []).length; localStorage.setItem("hw-last-export-counts", JSON.stringify(counts)); } catch { /* ignore */ }
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
