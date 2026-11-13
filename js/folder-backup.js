// Automatic backups to a folder on this computer (Chrome / Edge: File System Access API).
// The folder is chosen once; the browser remembers it. After every finished day (and on demand) a full backup is written
// there: hardwood-latest.json always, plus one file per day (hardwood-<season>-day-<N>.json, the newest 12 are kept).
// Restore with "Restore from backup" on the Commissioner desk, choosing any of those files.
import { exportAll, leagueModeNow, modeKey } from "./league/store.js";

// The commissioner's league and a visitor's own league (store.js) never share a folder or a file name.
const DB = "hardwood-sim-handles", STORE = "handles", ownLeague = () => leagueModeNow() === "mine", KEY = () => (ownLeague() ? "backup-folder-mine" : "backup-folder"), PREFIX = () => (ownLeague() ? "hardwood-mine-" : "hardwood-");
const openDB = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const idb = async (mode, fn) => { const db = await openDB(); try { return await new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = fn(t.objectStore(STORE)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); } finally { db.close(); } };

export const folderSupported = () => typeof window !== "undefined" && (typeof window.showDirectoryPicker === "function" || typeof window.__hwPickFolder === "function");
const LAST = () => modeKey("folder-last");
export const lastBackup = () => { try { return JSON.parse(localStorage.getItem(LAST()) || "null"); } catch { return null; } };

/** must be called from a click: asks for a folder and remembers it */
// Test hook: tests define window.__hwPickFolder (returning the browser's private file system) because the native folder
// picker can't be scripted and headless Chromium can't keep that handle in IndexedDB. Real use never sets it.
const TESTFLAG = "hw-test-folder";
export async function pickFolder() {
  if (window.__hwPickFolder) { const h = await window.__hwPickFolder(); try { localStorage.setItem(TESTFLAG, "1"); } catch { /* ignore */ } return h; }
  const handle = await window.showDirectoryPicker({ id: "hardwood-backups", mode: "readwrite", startIn: "documents" });
  await idb("readwrite", (s) => s.put(handle, KEY()));
  return handle;
}
export async function forgetFolder() { try { localStorage.removeItem(TESTFLAG); } catch { /* ignore */ } try { await idb("readwrite", (s) => s.delete(KEY())); } catch { /* ignore */ } try { localStorage.removeItem(LAST()); } catch { /* ignore */ } }
export async function savedFolder() {
  try { if (window.__hwPickFolder && localStorage.getItem(TESTFLAG) === "1") return await window.__hwPickFolder(); } catch { /* ignore */ }
  try { return (await idb("readonly", (s) => s.get(KEY()))) || null; } catch { return null; }
}

/** "granted" | "prompt" | "denied" | "none". ask=true (from a click) shows the browser's permission prompt if needed. */
export async function folderPermission(handle, ask = false) {
  if (!handle) return "none";
  try {
    let p = await handle.queryPermission({ mode: "readwrite" });
    if (p !== "granted" && ask) p = await handle.requestPermission({ mode: "readwrite" });
    return p;
  } catch { return "denied"; }
}

async function write(dir, name, text) { const f = await dir.getFileHandle(name, { create: true }); const w = await f.createWritable(); await w.write(text); await w.close(); }

/** write the backup; returns { name, bytes, at }. Throws if the folder can't be written. */
export async function backupToFolder(handle, { season, day, keep = 12 } = {}) {
  const obj = await exportAll(), text = JSON.stringify(obj), at = new Date().toISOString();
  await write(handle, PREFIX() + "latest.json", text);
  const name = `${PREFIX()}${season || "season"}-day-${day ?? 0}.json`;
  await write(handle, name, text);
  // keep only the newest `keep` day files (our own naming pattern only; never touches anything else)
  const mine = [];
  for await (const [fname, h] of handle.entries()) if ((ownLeague() ? /^hardwood-mine-.+-day-\d+\.json$/ : /^hardwood-(?!mine-).+-day-\d+\.json$/).test(fname) && h.kind === "file") mine.push({ fname, f: await h.getFile() });
  mine.sort((a, b) => b.f.lastModified - a.f.lastModified);
  for (const m of mine.slice(keep)) { try { await handle.removeEntry(m.fname); } catch { /* ignore */ } }
  const info = { at, name, bytes: text.length, season, day, folder: handle.name };
  try { localStorage.setItem(LAST(), JSON.stringify(info)); } catch { /* ignore */ }
  return info;
}

/** Back up if a folder is connected and already permitted (no prompt). Returns the info, or null when it couldn't. */
export async function autoBackup(opts) {
  try {
    const h = await savedFolder(); if (!h) return null;
    if ((await folderPermission(h, false)) !== "granted") return null;
    return await backupToFolder(h, opts);
  } catch { return null; }
}
