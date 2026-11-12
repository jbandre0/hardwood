// Game desk in a real browser: next scheduled game is loaded with no typing, re-roll, log with Enter, next game loads.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-sims', '1000'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#gameDesk .gd-score');
  const head = await p.locator('#gameDesk h2').innerText();
  ok(/Game \d+/i.test(head), 'next scheduled game loaded automatically: ' + head);
  const scores = async () => (await p.locator('#gameDesk .gd-pts').allInnerTexts()).map(Number);
  const s0 = await scores(); ok(s0.every((x) => x >= 30 && x <= 160) && s0[0] !== s0[1], 'a single final score is shown: ' + s0.join('-'));
  let changed = false; for (let i = 0; i < 5 && !changed; i++) { await p.keyboard.press('r'); const s = await scores(); changed = s.join() !== s0.join(); }
  ok(changed, 'R re-rolls the game');
  const shown = await scores(); const played0 = +(await p.locator('#kPlayed').innerText()).replace(/,/g, '');
  const id = +head.match(/\d+/)[0];
  await p.keyboard.press('Enter'); await p.waitForFunction((h) => document.querySelector('#gameDesk h2') && document.querySelector('#gameDesk h2').innerText !== h, head, { timeout: 15000 });
  const head2 = await p.locator('#gameDesk h2').innerText(); const id2 = +head2.match(/\d+/)[0];
  ok(id2 !== id, `Enter logged game ${id} and loaded game ${id2}`);
  ok(+(await p.locator('#kPlayed').innerText()).replace(/,/g, '') === played0 + 1, 'games played went up by exactly 1');
  const logged = (await p.locator('#gdPrev').innerText()).match(/(\d+)/g).map(Number);
  ok(logged.join('-') === shown.join('-'), `the logged score is exactly the one on screen (${shown.join('-')} vs ${logged.join('-')})`);
  for (let i = 0; i < 5; i++) { await p.click('#gdLog'); await p.waitForTimeout(250); }
  ok(+(await p.locator('#kPlayed').innerText()).replace(/,/g, '') === played0 + 6, 'six games logged in a row without typing anything');
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  ok(+(await p.locator('#kPlayed').innerText()).replace(/,/g, '') === played0 + 6, 'still there after reload');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await p.locator('#gameDesk').screenshot({ path: '/tmp/claude-0/shots/gamedesk.png' });
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
