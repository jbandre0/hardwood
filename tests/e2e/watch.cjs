// Watch mode in a real browser: the right game, one roll, logged exactly once when it ends, same as Play game.
const { chromium } = require('playwright');
const META = require(__dirname + '/../../data/seasons/season-2/meta.json'), P = META.playedGames;
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
const num = (s) => +String(s).replace(/,/g, '');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1100 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-on', '0'); localStorage.setItem('hw-watch-speed', 'Blur'); } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#gdWatch');
  const head = await p.locator('#gameDesk h2').innerText(), id = +head.match(/\d+/)[0];
  const teamsBefore = (await p.locator('#gameDesk .gd-team b').allInnerTexts()).map((t) => t.replace(/\s*\(home\)/, ''));
  await p.click('#gdWatch'); await p.waitForSelector('#wvFeed');
  ok(num(await p.locator('#kPlayed').innerText()) === P, 'nothing is logged while the game is on');
  const names = (await p.locator('.wv-team b').allInnerTexts()).map((t) => t.replace(/\s*\(home\)/, ''));
  ok(names.join('|') === teamsBefore.join('|'), 'watching the same game that was loaded: ' + names.join(' vs '));
  await p.waitForSelector('.wv-play'); await p.waitForTimeout(300);
  ok((await p.locator('.wv-play').count()) >= 1 && (await p.locator('#wvClock').innerText()).length > 3, 'play-by-play and clock are running');
  await p.waitForSelector('#wvFinal:not([hidden])', { timeout: 60000 });
  await p.waitForFunction(() => !document.querySelector('#wvNext').disabled, null, { timeout: 15000 });
  const a = num(await p.locator('#wvA').innerText()), bb = num(await p.locator('#wvB').innerText());
  ok(a >= 30 && bb >= 30 && a !== bb, `final ${a}-${bb}`);
  ok(num(await p.locator('#kPlayed').innerText()) === P + 1, 'the game is logged once (games played +1)');
  ok(/logged to the season/i.test(await p.locator('#wvLogState').innerText()), 'final screen says it is logged');
  ok((await p.locator('.wv-story li').count()) >= 3, 'story and turning points shown');
  await p.screenshot({ path: '/tmp/claude-0/shots/watch-final.png' });
  await p.click('#wvReplay'); await p.waitForSelector('#wvFinal:not([hidden])', { timeout: 60000 }); await p.waitForTimeout(500);
  ok(num(await p.locator('#kPlayed').innerText()) === P + 1, 'replaying does not log it again');
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#kPlayed');
  ok(num(await p.locator('#kPlayed').innerText()) === P + 1, 'still logged after reload');
  // the logged score equals what the desk showed
  const st = await p.evaluate(async (gid) => { const m = await import('/js/data.js'); const c = await m.loadCore(); const g = c.state.byId.get(gid); return [g.ptsA, g.ptsB]; }, id);
  ok(st[0] === a && st[1] === bb, `logged score ${st.join('-')} equals the watched final`);
  // leaving mid-game does not log it, and coming back gives the SAME game result
  await p.waitForSelector('#gdWatch');
  await p.evaluate(() => { localStorage.setItem('hw-watch-speed', 'Broadcast'); });
  const id2 = +(await p.locator('#gameDesk h2').innerText()).match(/\d+/)[0];
  await p.click('#gdWatch'); await p.waitForSelector('.wv-play'); await p.waitForTimeout(600);
  const seed1 = await p.evaluate(() => localStorage.getItem('hw-pending-season-2'));
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#gdWatch');
  ok(num(await p.locator('#kPlayed').innerText()) === P + 1, 'leaving mid-game logs nothing');
  ok((await p.evaluate(() => localStorage.getItem('hw-pending-season-2'))) === seed1 && JSON.parse(seed1).id === id2, 'the game keeps its seed, so leaving cannot re-roll it');
  await p.evaluate(() => { localStorage.setItem('hw-watch-speed', 'Blur'); });
  await p.click('#gdWatch'); await p.waitForSelector('.wv-play'); await p.click('#wvSkip'); await p.waitForFunction(() => !document.querySelector('#wvNext')?.disabled, null, { timeout: 15000 });
  ok(num(await p.locator('#kPlayed').innerText()) === P + 2, 'Skip to final logs the game');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
