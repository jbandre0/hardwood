// Weekly GitHub backup: play games, export (backup inside), save it with tools/save_backup.mjs, then restore it in a
// brand-new browser profile from the Commissioner desk. Puts data/backups/latest.json back the way it was afterwards.
const { chromium } = require('playwright'); const fs = require('fs'); const { execFileSync } = require('child_process');
const META = require(__dirname + '/../../data/seasons/season-2/meta.json'), P = META.playedGames, D = META.lastPlayedDay, PF = P.toLocaleString('en-US');
const BASE = process.env.BASE || 'http://localhost:8000/', FILE = __dirname + '/../../data/backups/latest.json';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
const original = fs.readFileSync(FILE);
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ acceptDownloads: true }); await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-on', '0'); } catch (e) {} });
    const p = await ctx.newPage(); await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#gameDesk .gd-score');
    for (let i = 0; i < 3; i++) { await p.keyboard.press('Enter'); await p.waitForSelector('#gdNext'); await p.keyboard.press('Enter'); await p.waitForSelector('#gdPlay'); }
    const [d] = await Promise.all([p.waitForEvent('download'), p.click('#exportBk')]);
    const path = '/tmp/hw-export-test.json'; fs.copyFileSync(await d.path(), path);
    const x = JSON.parse(fs.readFileSync(path, 'utf8'));
    ok(x.backup && x.backup.overlays['season-2'].order.length === 3, 'export carries a backup with the 3 games');
    const out = execFileSync('node', [__dirname + '/../../tools/save_backup.mjs', path], { encoding: 'utf8' });
    ok(out.includes(`Backup saved: Season 2 through day ${D + 1}`), out.trim());
    const fresh = await b.newContext(); await fresh.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); } catch (e) {} });
    const q = await fresh.newPage(); q.on('dialog', (dl) => dl.accept());
    await q.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await q.waitForSelector('#restoreRepo', { timeout: 15000 });
    ok((await q.locator('#repoBackup').innerText()).includes(`Weekly backup on GitHub: Season 2 through day ${D + 1}`), 'a new browser sees the GitHub backup');
    const before = +(await q.locator('#kPlayed').innerText()).replace(/,/g, '');
    await q.click('#restoreRepo'); await q.waitForFunction(() => /Restored the weekly GitHub backup/.test(document.getElementById('bstatus')?.textContent || ''), null, { timeout: 30000 });
    ok(+(await q.locator('#kPlayed').innerText()).replace(/,/g, '') === before + 3, 'restore brings the 3 games into the new browser');
  } finally { fs.writeFileSync(FILE, original); await b.close(); }
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
