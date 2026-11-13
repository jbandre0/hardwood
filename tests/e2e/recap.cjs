// Finishing a day sends you to its recap, from Play day and from the Game desk; the recap sends you back to the desk.
const { chromium } = require('playwright');
const META = require(__dirname + '/../../data/seasons/season-2/meta.json'), P = META.playedGames, D = META.lastPlayedDay, PF = P.toLocaleString('en-US');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
(async () => {
  const b = await chromium.launch(); { const nc = b.newContext.bind(b); b.newContext = async (o) => { const c = await nc(o); await c.addInitScript(() => { try { if (!localStorage.getItem('hw-league')) localStorage.setItem('hw-league', 'main'); } catch (e) {} }); return c; }; } /* these tests run in the commissioner's league */ const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-on', '0'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#playDay');
  await p.click('#playDay'); await p.waitForURL(new RegExp('recap\\.html\\?day=' + (D + 1)), { timeout: 60000 }); await p.waitForSelector('h1');
  const t = await p.locator('main').innerText();
  ok(new RegExp(`Day ${D + 1} is in the books`, 'i').test(t), `Play day lands on the day ${D + 1} recap`);
  ok(new RegExp(`Power rankings after day ${D + 1}`, 'i').test(t) && /Every result/i.test(t), 'recap shows power rankings and every result');
  await p.click('#goNext'); await p.waitForURL(/play\.html/); await p.waitForSelector('#gameDesk .gd-score');
  ok((await p.locator('#gameDesk').innerText()).includes(`Day ${D + 2}`), `Start day ${D + 2} goes back to the desk with that day loaded`);
  const n = +((await p.locator('#playDay').innerText()).match(/\((\d+) games/)[1]);
  for (let i = 0; i < n; i++) { await p.keyboard.press('Enter'); await p.waitForSelector('#gdNext'); if (i < n - 1) { await p.keyboard.press('Enter'); await p.waitForSelector('#gdPlay'); } }
  ok(new RegExp(`Day ${D + 2} is finished`, 'i').test(await p.locator('#gdNext').innerText()), `after the ${n}th game the desk says day ${D + 2} is finished`);
  await p.keyboard.press('Enter'); await p.waitForURL(new RegExp('recap\\.html\\?day=' + (D + 2))); await p.waitForSelector('h1');
  ok(new RegExp(`Day ${D + 2} is in the books`, 'i').test(await p.locator('main').innerText()), `Enter opens the day ${D + 2} recap`);
  await p.screenshot({ path: '/tmp/claude-0/shots/recap.png', fullPage: false });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
