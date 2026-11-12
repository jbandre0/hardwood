// Commissioner flow in a real browser: play a day, reload (persistence), undo, backup export. Uses a throwaway browser profile.
const { chromium } = require('playwright'); const fs = require('fs');
const META = require(__dirname + '/../../data/seasons/season-2/meta.json'), P = META.playedGames, D = META.lastPlayedDay, PF = P.toLocaleString('en-US');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('dialog', d => d.accept());
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#playDay');
  const txt0 = await p.locator('main').innerText();
  ok(txt0.includes(PF) && txt0.includes(`Play day ${D + 1}`), `starts at ${PF} games with day ${D + 1} next`);
  await p.click('#playDay'); await p.waitForURL(new RegExp('recap\\.html\\?day=' + (D + 1)), { timeout: 120000 }); await p.waitForSelector('h1');
  ok(new RegExp(`Day ${D + 1} is in the books`, 'i').test(await p.locator('main').innerText()), 'Play day opens the next day\'s recap');
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  const txt1 = await p.locator('main').innerText();
  const m = txt1.match(/Games played\s+([\d,]+)/); const played = m ? +m[1].replace(/,/g, '') : 0;
  ok(played > P && played < P + 200, `games played rose to ${played}`);
  ok(/recorded on this site/i.test(txt1), 'recorded list shown on the desk');
  await p.screenshot({ path: process.env.SHOT || '/tmp/runner.png', fullPage: false });
  // box score dialog
  await p.locator('tr.clickable td.num').first().click(); await p.waitForSelector('dialog[open]');
  ok(/Possessions/.test(await p.locator('dialog').innerText()), 'box score dialog opens');
  await p.click('#boxClose');
  // persistence: reload
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#playDay, #playOne');
  const txt2 = await p.locator('main').innerText(); const m2 = txt2.match(/Games played\s+([\d,]+)/);
  ok(m2 && +m2[1].replace(/,/g, '') === played, 'still ' + played + ' games after reload (saved in the browser)');
  ok(/recorded since your last backup/.test(txt2), 'unsaved-backup warning shown');
  // other pages see the new games
  const r = await ctx.newPage(); await r.goto(BASE + 'rankings.html', { waitUntil: 'networkidle' }); await r.waitForTimeout(500);
  ok((await r.locator('main').innerText()).includes(`through day ${D + 1}`), `rankings now reads through day ${D + 1}`);
  await r.close();
  // backup
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportBtn')]);
  const path = await dl.path(); const bk = JSON.parse(fs.readFileSync(path, 'utf8'));
  ok(bk.app === 'hardwood-sim' && bk.overlays['season-2'].order.length === played - P, 'backup file holds the ' + (played - P) + ' recorded games');
  await p.waitForTimeout(300);
  ok(!/recorded since your last backup/.test(await p.locator('main').innerText()), 'warning clears after backup');
  // undo the day, then restore from the backup
  await p.click('#undoDay'); await p.waitForFunction((pf) => document.querySelector('main').innerText.includes(pf), PF, { timeout: 15000 });
  ok(true, `undo last day returns to ${PF}`);
  await p.setInputFiles('#importFile', path); await p.waitForFunction((n) => document.querySelector('main').innerText.includes(n.toLocaleString()), played, { timeout: 15000 });
  ok(true, 'restore from backup brings the games back');
  await p.click('#discardBtn'); await p.waitForFunction((pf) => document.querySelector('main').innerText.includes(pf), PF, { timeout: 15000 });
  ok(true, 'discard returns to the imported baseline');
  ok(errs.length === 0, 'no console errors ' + errs.slice(0, 2).join(' | '));
  await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
