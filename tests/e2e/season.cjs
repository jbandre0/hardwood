// Plays Season 2 from day 14 to the national championship in a real browser (throwaway profile, nothing is kept).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' });
  let days = 0, fieldDone = false;
  for (let i = 0; i < 80; i++) {
    await p.waitForSelector('#playDay, #lockField, .status', { timeout: 30000 });
    if (await p.locator('#lockField').count()) { await p.click('#lockField'); fieldDone = true;  await p.waitForFunction(() => /field set/i.test(document.getElementById('status')?.textContent || ''), null, { timeout: 30000 }); continue; }
    if (!(await p.locator('#playDay').count())) break;
    const label = await p.locator('#playDay').innerText(); const day = +label.match(/day (\d+)/)[1];
    await p.click('#playDay'); await p.waitForURL(/recap\.html/, { timeout: 120000 }); await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); days++;
  }
  ok(fieldDone, 'NCAA field built when conference tournaments finished');
  ok(/season is over/i.test(await p.locator('main').innerText()), 'desk reports the season is over');
  const br = await ctx.newPage(); await br.goto(BASE + 'bracket.html', { waitUntil: 'networkidle' }); await br.waitForTimeout(500);
  const bt = await br.locator('main').innerText();
  ok(/National champion/i.test(bt) && !/TBD\s*$/m.test(bt.split('NATIONAL CHAMPION')[1] || ''), 'bracket page shows a national champion');
  ok((await br.locator('.game').count()) >= 60, 'bracket draws the games: ' + await br.locator('.game').count());
  const st = await ctx.newPage(); await st.goto(BASE + 'standings.html?c=ACC', { waitUntil: 'networkidle' });
  ok(/Champion:/i.test(await st.locator('main').innerText()), 'standings show a conference tournament champion');
  ok(errs.length === 0, 'no console errors: ' + errs.slice(0, 2).join(' | '));
  await br.screenshot({ path: process.env.SHOT || '/tmp/season-end.png', fullPage: true });
  console.log(`\n${pass} passed, ${fail} failed (${days} days played)`); await b.close(); process.exit(fail ? 1 : 0);
})();
