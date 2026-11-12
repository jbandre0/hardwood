// Finishing a day sends you to its recap, from Play day and from the Game desk; the recap sends you back to the desk.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-on', '0'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#playDay');
  await p.click('#playDay'); await p.waitForURL(/recap\.html\?day=14/, { timeout: 60000 }); await p.waitForSelector('h1');
  const t = await p.locator('main').innerText();
  ok(/Day 14 is in the books/i.test(t), 'Play day lands on the day 14 recap');
  ok(/Power rankings after day 14/i.test(t) && /Every result/i.test(t), 'recap shows power rankings and every result');
  await p.click('#goNext'); await p.waitForURL(/play\.html/); await p.waitForSelector('#gameDesk .gd-score');
  ok(/Day 15/.test(await p.locator('#gameDesk').innerText()), 'Start day 15 goes back to the desk with day 15 loaded');
  const n = +((await p.locator('#playDay').innerText()).match(/\((\d+) games/)[1]);
  for (let i = 0; i < n; i++) { await p.keyboard.press('Enter'); await p.waitForSelector('#gdNext'); if (i < n - 1) { await p.keyboard.press('Enter'); await p.waitForSelector('#gdPlay'); } }
  ok(/Day 15 is finished/i.test(await p.locator('#gdNext').innerText()), `after the ${n}th game the desk says day 15 is finished`);
  await p.keyboard.press('Enter'); await p.waitForURL(/recap\.html\?day=15/); await p.waitForSelector('h1');
  ok(/Day 15 is in the books/i.test(await p.locator('main').innerText()), 'Enter opens the day 15 recap');
  await p.screenshot({ path: '/tmp/claude-0/shots/recap.png', fullPage: false });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
