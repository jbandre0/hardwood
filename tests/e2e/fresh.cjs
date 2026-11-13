// A brand-new browser gets its own blank Season 1; a browser with the commissioner's data keeps the commissioner's league.
// The two leagues live in separate storage and switching never deletes either.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
const num = (s) => +String(s).replace(/,/g, '');
const keysIn = (p, db) => p.evaluate((db) => new Promise((res) => { const r = indexedDB.open(db, 1); r.onupgradeneeded = () => r.result.createObjectStore('overlays'); r.onsuccess = () => { const t = r.result.transaction('overlays', 'readonly').objectStore('overlays').getAllKeys(); t.onsuccess = () => { r.result.close(); res(t.result.map(String).sort()); }; }; }), db);
(async () => {
  const b = await chromium.launch();
  // ---- a visitor: nothing saved in this browser
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-pred-on', '0'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
  ok(await p.evaluate(() => localStorage.getItem('hw-league')) === 'mine', 'a new browser opens its own league');
  ok(/Your own league/.test(await p.locator('.rail-foot').innerText()), 'the sidebar says so');
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#gameDesk .gd-score');
  ok(num(await p.locator('#kPlayed').innerText()) === 0, 'Season 1, nothing played');
  ok(/Season 1/.test(await p.locator('body').innerText()), 'it is Season 1');
  ok((await p.locator('#restoreRepo').count()) === 0, "the commissioner's GitHub backup is not offered");
  await p.click('#gdPlay'); await p.waitForSelector('#gdNext');
  ok(num(await p.locator('#kPlayed').innerText()) === 1, 'a game can be played and logged');
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  ok(num(await p.locator('#kPlayed').innerText()) === 1, 'still there after reload');
  ok(JSON.stringify(await keysIn(p, 'hardwood-sim-mine')) === JSON.stringify(['base:season-1', 'meta:seasons', 'season-1']), 'saved in its own database: ' + (await keysIn(p, 'hardwood-sim-mine')).join(','));
  ok((await keysIn(p, 'hardwood-sim')).length === 0, "nothing written to the commissioner's database");
  for (const page of ['standings.html', 'rankings.html', 'bracketology.html', 'news.html', 'stats.html', 'history.html', 'challenge.html', 'offseason.html']) {
    const q = await ctx.newPage(); const e2 = []; q.on('pageerror', (e) => e2.push(e.message));
    await q.goto(BASE + page, { waitUntil: 'networkidle' }); await q.waitForTimeout(300);
    const txt = await q.locator('main, body').first().innerText();
    ok(e2.length === 0 && !/Couldn't load the data/.test(txt), `${page} works in a fresh league ${e2.join(' | ')}`);
    if (page === 'bracketology.html') ok(!/Bracketology HQ/.test(txt), 'no commissioner editions in the fresh league');
    await q.close();
  }
  // switch to the commissioner's league and back: both still there
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  await p.click('#leagueSwitch'); await p.waitForLoadState('networkidle'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => localStorage.getItem('hw-league')) === 'main' && /commissioner's league/.test(await p.locator('.rail-foot').innerText()), "switched to the commissioner's league");
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  ok(num(await p.locator('#kPlayed').innerText()) > 1000, "the commissioner's league shows its seasons");
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await p.click('#leagueSwitch'); await p.waitForLoadState('networkidle');
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  ok(num(await p.locator('#kPlayed').innerText()) === 1, 'back in the own league, the played game is still there');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await ctx.close();

  // ---- the commissioner: this browser already has data in the commissioner's database (and no league chosen yet)
  const c2 = await b.newContext(); const q = await c2.newPage(); const e3 = []; q.on('pageerror', (e) => e3.push(e.message));
  await q.goto(BASE + 'about.html', { waitUntil: 'domcontentloaded' });
  await q.evaluate(() => { localStorage.removeItem('hw-league'); return new Promise((res) => { const r = indexedDB.open('hardwood-sim', 1); r.onupgradeneeded = () => r.result.createObjectStore('overlays'); r.onsuccess = () => { const t = r.result.transaction('overlays', 'readwrite'); t.objectStore('overlays').put({ format: 1, season: 'season-2', games: {}, box: {}, order: [], meta: {}, content: { engine: 'v10' } }, 'season-2'); t.oncomplete = () => { r.result.close(); res(); }; }; }); });
  await q.evaluate(() => localStorage.removeItem('hw-league'));
  await q.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await q.waitForSelector('#kPlayed');
  ok(await q.evaluate(() => localStorage.getItem('hw-league')) === 'main', "a browser with the commissioner's data opens the commissioner's league");
  ok(num(await q.locator('#kPlayed').innerText()) > 1000 && /Season 2/.test(await q.locator('body').innerText()), 'and shows Season 2 as before');
  ok((await keysIn(q, 'hardwood-sim')).includes('season-2'), "the commissioner's data is untouched");
  ok(e3.length === 0, 'no page errors ' + e3.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
