// Bracket challenge in a real browser: fill a bracket (Season 2 gets Season 1's field injected into this throwaway profile),
// change an early pick, persistence, then Season 1's finished bracket scores the bots against real results.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
(async () => {
  const b = await chromium.launch(); { const nc = b.newContext.bind(b); b.newContext = async (o) => { const c = await nc(o); await c.addInitScript(() => { try { if (!localStorage.getItem('hw-league')) localStorage.setItem('hw-league', 'main'); } catch (e) {} }); return c; }; } /* these tests run in the commissioner's league */ const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('hw-init')) { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-init', '1'); } } catch (e) {} });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto(BASE + 'challenge.html', { waitUntil: 'networkidle' }); await p.waitForSelector('h1');
  ok(/field isn't set yet/i.test(await p.locator('main').innerText()), 'before the field exists the page explains and waits');
  await p.evaluate(async () => {
    const d = await import('/js/data.js'), L = await import('/js/league/league.js'), S = await import('/js/league/store.js'), c = await d.loadCore();
    const nc = await (await fetch('/data/seasons/season-1/ncaa.json')).json();
    L.setContent(c.state, 'field', nc.field.map((f) => ({ team: f.team, seed: f.seed, region: f.region, ff: f.ff })));
    await S.saveOverlay('season-2', L.toOverlay(c.state));
  });
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('.chal.editable');
  ok(/0 of 67 picked/.test(await p.locator('main').innerText()), 'bracket opens empty and editable');
  await p.click('#fillChalk'); await p.waitForFunction(() => /67 of 67 picked/.test(document.querySelector('main').innerText));
  ok(true, 'fill with chalk completes all 67 picks');
  const champ0 = await p.locator('.champ-card h2').innerText();
  // flip the first game of the East (a 1 v 16): pick the 16 seed
  const first = p.locator('button.pickable[data-g="5814"]'); const unpicked = first.nth(0).evaluate((el) => el.classList.contains('win')) ;
  const buttons = await p.locator('button.pickable[data-g="5814"]').all();
  for (const bt of buttons) if (!(await bt.evaluate((el) => el.classList.contains('win')))) { await bt.click(); break; }
  await p.waitForFunction(() => !/67 of 67 picked/.test(document.querySelector('main').innerText));
  const left = +(await p.locator('main').innerText()).match(/(\d+) of 67 picked/)[1];
  ok(left < 67 && left >= 60, `changing an early pick cleared only the picks that depended on it (${left} left)`);
  await p.click('#fillRating'); await p.waitForFunction(() => /67 of 67 picked/.test(document.querySelector('main').innerText));
  await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('.chal.editable');
  ok(/67 of 67 picked/.test(await p.locator('main').innerText()), 'picks are saved in the browser');
  ok((await p.locator('tr[data-e="you"]').innerText()).includes('You') && (await p.locator('tr[data-e="chalk"]').count()) === 1, 'leaderboard lists you and the bots');
  await p.click('tr[data-e="chalk"]'); await p.waitForTimeout(300);
  ok((await p.locator('.chal.editable').count()) === 0, "a bot's bracket is read-only");
  void champ0;
  // Season 1: finished tournament, real scoring
  const q = await ctx.newPage(); await q.goto(BASE + 'challenge.html?s=season-1', { waitUntil: 'networkidle' }); await q.waitForSelector('tr[data-e]');
  const t = await q.locator('main').innerText();
  ok(/Entries are locked/.test(t), 'Season 1 is locked');
  const totals = (await q.locator('tbody tr').all()).length; ok(totals >= 2, 'Season 1 leaderboard has the bots');
  ok((await q.locator('.game .tm.ok').count()) > 10, 'correct picks are marked green: ' + await q.locator('.game .tm.ok').count());
  await q.screenshot({ path: '/tmp/claude-0/shots/challenge.png', fullPage: false });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
