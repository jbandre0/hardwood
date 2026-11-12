// Game desk in a real browser: load next game (preview, nothing played), Play game (one roll, logged), load next; no typing.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
const num = (s) => +String(s).replace(/,/g, '');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-sims', '1000'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#gameDesk .gd-score');
  const played0 = num(await p.locator('#kPlayed').innerText());
  const head = await p.locator('#gameDesk h2').innerText(), id = +head.match(/\d+/)[0];
  const preview = await p.locator('#gameDesk').innerText();
  ok(/Game \d+/i.test(head) && /conf/.test(preview) && /rating/.test(preview), 'next scheduled game loaded as a preview with records: ' + head);
  ok((await p.locator('#gameDesk .gd-pts').allInnerTexts()).every((x) => x.trim() === ''), 'no score before it is played');
  ok(num(await p.locator('#kPlayed').innerText()) === played0, 'loading did not play anything');
  await p.click('#gdPlay'); await p.waitForSelector('#gdNext');
  const sc = (await p.locator('#gameDesk .gd-pts').allInnerTexts()).map(Number);
  ok(sc.every((x) => x >= 30 && x <= 170) && sc[0] !== sc[1], 'Play game shows one final score: ' + sc.join('-'));
  ok(num(await p.locator('#kPlayed').innerText()) === played0 + 1, 'and logs it (games played +1)');
  ok(/logged to the season/i.test(await p.locator('#gameDesk').innerText()), 'result says it is logged');
  await p.keyboard.press('Enter'); await p.waitForFunction((h) => document.querySelector('#gameDesk h2')?.innerText !== h, head);
  const id2 = +(await p.locator('#gameDesk h2').innerText()).match(/\d+/)[0];
  ok(id2 !== id && (await p.locator('#gdPlay').count()) === 1, `Enter loaded the next game (${id2}) as a preview`);
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Enter'); await p.waitForSelector('#gdNext'); await p.keyboard.press('Enter'); await p.waitForSelector('#gdPlay'); }
  ok(num(await p.locator('#kPlayed').innerText()) === played0 + 5, 'five games played and logged with Enter only');
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  ok(num(await p.locator('#kPlayed').innerText()) === played0 + 5, 'still logged after reload');
  // the logged game shows up on the standings / team pages
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await p.locator('#gameDesk').screenshot({ path: '/tmp/claude-0/shots/gamedesk.png' });
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
