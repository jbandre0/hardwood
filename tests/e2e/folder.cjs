// Automatic backups to a folder, tested with the browser's private file system standing in for a real folder
// (the native folder picker can't be driven from a script). Uses a throwaway profile.
const { chromium } = require('playwright');
const META = require(__dirname + '/../../data/seasons/season-2/meta.json'), D = META.lastPlayedDay;
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
const ls = (p) => p.evaluate(async () => { const d = await navigator.storage.getDirectory(), out = []; for await (const [n, h] of d.entries()) if (h.kind === 'file') out.push([n, (await h.getFile()).size]); return out.sort(); });
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { window.__hwPickFolder = () => navigator.storage.getDirectory(); try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-on', '0'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#folderBody');
  ok(/Choose a backup folder/.test(await p.locator('#folderBody').innerText()), 'desk offers to choose a backup folder');
  await p.click('#fPick'); await p.waitForFunction(() => /Saved hardwood-season-2-day-\d+\.json/.test(document.querySelector('#folderBody').innerText), null, { timeout: 30000 });
  let files = await ls(p);
  ok(files.some(([n]) => n === 'hardwood-latest.json') && files.some(([n]) => n === `hardwood-season-2-day-${D}.json`), 'choosing the folder saves a first backup: ' + files.map((f) => f[0]).join(', '));
  ok(/Saving to/.test(await p.locator('#folderBody').innerText()), 'desk shows the folder is connected');
  // play a day: the recap saves the next backup by itself
  await p.waitForSelector('#playDay'); await p.click('#playDay'); await p.waitForURL(/recap\.html/, { timeout: 120000 }); await p.waitForSelector('h1'); await p.waitForTimeout(1500);
  files = await ls(p);
  ok(files.some(([n]) => n === `hardwood-season-2-day-${D + 1}.json`), `finishing day ${D + 1} saved its backup automatically`);
  const backup = await p.evaluate(async () => { const d = await navigator.storage.getDirectory(); return JSON.parse(await (await (await d.getFileHandle('hardwood-latest.json')).getFile()).text()); });
  ok(backup.app === 'hardwood-sim' && backup.overlays['season-2'].order.length > 50, 'the backup holds the games just played (' + backup.overlays['season-2'].order.length + ')');
  // restore path: the file is a normal backup the desk can import
  const restored = await p.evaluate(async (bk) => { const S = await import('/js/league/store.js'); await S.clearOverlay('season-2'); const ids = await S.importAll(bk); const o = await S.loadOverlay('season-2'); return [ids, o.order.length]; }, backup);
  ok(restored[1] === backup.overlays['season-2'].order.length, 'importing the folder backup restores every game');
  // retention: only the newest 12 day files are kept, other files are never touched
  const kept = await p.evaluate(async () => { const F = await import('/js/folder-backup.js'), d = await navigator.storage.getDirectory(); const f = await d.getFileHandle('my-notes.txt', { create: true }); const w = await f.createWritable(); await w.write('keep me'); await w.close();
    for (let day = 1; day <= 16; day++) await F.backupToFolder(d, { season: 'season-9', day }); const out = []; for await (const [n] of d.entries()) out.push(n); return out; });
  ok(kept.filter((n) => /season-9-day/.test(n)).length === 12, 'keeps the newest 12 day files: ' + kept.filter((n) => /season-9-day/.test(n)).length);
  ok(kept.includes('my-notes.txt') && kept.includes('hardwood-latest.json'), "other files in the folder are never touched");
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
