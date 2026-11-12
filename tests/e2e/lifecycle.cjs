// Full commissioner lifecycle in a real browser (throwaway profile; nothing is kept):
// predictions on -> cast an AP ballot -> draft + publish a weekly column -> play Season 2 to the title ->
// offseason (override a tier) -> create Season 3 -> play its day 1 -> history and predictions pages reflect it all.
const { chromium } = require('playwright'); const fs = require('fs');
const META = require(__dirname + '/../../data/seasons/season-2/meta.json'), P = META.playedGames, D = META.lastPlayedDay, PF = P.toLocaleString('en-US');
const BASE = process.env.BASE || 'http://localhost:8000/';
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL ' + m)); if (c) console.log('PASS ' + m); };
const txt = (p) => p.locator('main').innerText();
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('hw-init')) { localStorage.setItem('hw-season', 'season-2'); localStorage.setItem('hw-pred-sims', '1000'); localStorage.setItem('hw-init', '1'); } } catch (e) {} });
  const errs = []; ctx.on('page', (pg) => { pg.on('pageerror', (e) => errs.push(pg.url().split('/').pop() + ': ' + e.message)); pg.on('dialog', (d) => d.accept()); });
  const p = await ctx.newPage();

  // 1) AP ballot for week 5
  await p.goto(BASE + 'rankings.html#ap', { waitUntil: 'networkidle' }); await p.waitForSelector('#newBallot');
  await p.click('#newBallot'); await p.waitForSelector('#saveBallot');
  await p.locator('.ed-dn').first().click(); await p.waitForTimeout(200);
  await p.click('#saveBallot'); await p.waitForTimeout(800);
  const NW = META.ballotsWeeks[META.ballotsWeeks.length - 1] + 1;
  ok(new RegExp(`Week ${NW}`, 'i').test(await txt(p)) && new RegExp(`Released after day ${D}`, 'i').test(await txt(p)), `week ${NW} ballot saved`);
  await p.goto(BASE + 'rankings.html#poll', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  ok(/Power Poll/i.test(await txt(p)) && new RegExp(`Wk ${NW}`).test(await txt(p)), 'power poll snapshot saved with the ballot');

  // 2) weekly column
  await p.goto(BASE + 'news.html', { waitUntil: 'networkidle' }); await p.click('#draftBtn');
  await p.waitForSelector('#publish', { timeout: 60000 });
  const body = await p.locator('#body').inputValue();
  ok(/UPSET OF THE WEEK/.test(body) && /WHAT IF/.test(body), 'draft column has the analysis sections');
  await p.click('#publish'); await p.waitForSelector('#artBody');
  ok(/Weekly column/.test(await txt(p)), 'column published and readable');

  // 3) play the season out
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' });
  let days = 0;
  for (let i = 0; i < 80; i++) {
    await p.waitForSelector('#playDay, #lockField, .status', { timeout: 60000 });
    if (await p.locator('#lockField').count()) { await p.click('#lockField'); await p.waitForTimeout(1500); continue; }
    if (!(await p.locator('#playDay').count())) break;
    const day = +(await p.locator('#playDay').innerText()).match(/day (\d+)/)[1];
    await p.click('#playDay');
    await p.waitForFunction((d) => new RegExp('Day ' + d + ' results', 'i').test(document.querySelector('main').innerText), day, { timeout: 120000 }); days++;
  }
  ok(/season is over/i.test(await txt(p)), `season played out (${days} days)`);

  // 4) predictions scorecard
  await p.goto(BASE + 'predictions.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  const pt = await txt(p); const m = pt.match(/([\d,]+) scored games/);
  ok(m && +m[1].replace(/,/g, '') > 4000, 'scored predictions: ' + (m && m[1]));
  ok(/Weekly scorecard/i.test(pt) && /NCAA Tournament/i.test(pt), 'weekly scorecard incl. tournament');

  // 5) offseason: override one tier, create season 3
  await p.goto(BASE + 'offseason.html', { waitUntil: 'networkidle' }); await p.waitForSelector('.award');
  ok((await p.locator('.award').count()) === 14, '14 awards');
  const firstRow = p.locator('.tier-pick').first(); const cur = await firstRow.locator('button.on').innerText();
  const other = cur === 'S' ? 'A' : 'S';
  await firstRow.locator(`button[data-t="${other}"]`).click(); await p.waitForTimeout(600);
  ok(/1 overrides|Override/.test(await txt(p)), 'override recorded');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#create')]);
  ok(/before-season-3/.test(dl.suggestedFilename()), 'backup downloaded before creating the season');
  await p.waitForURL(/play\.html/, { timeout: 60000 }); await p.waitForSelector('#playDay', { timeout: 60000 });
  ok(/Season 3/.test(await p.locator('#seasonSel').inputValue()), 'Season 3 is now the active season');
  ok(/Play day 1/.test(await txt(p)), 'Season 3 starts at day 1');
  await p.click('#playDay'); await p.waitForFunction(() => /Day 1 results/i.test(document.querySelector('main').innerText), null, { timeout: 120000 });
  ok(true, 'Season 3 day 1 played');

  // 6) history across three seasons; season 2 now closed
  await p.goto(BASE + 'history.html', { waitUntil: 'networkidle' }); await p.waitForSelector('#h2hOut', { timeout: 60000 });
  const ht = await txt(p);
  ok(/3 seasons/.test(ht) && /2 finished/.test(ht), 'history sees 3 seasons, 2 finished');
  await p.goto(BASE + 'offseason.html?s=season-2', { waitUntil: 'networkidle' }); await p.waitForSelector('.award');
  ok(/closed/.test(await txt(p)) && /Season 3 was created/.test(await txt(p)), 'season 2 shows as closed');

  // 7) backup round trip includes season 3
  const bk = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok(bk.overlays['season-2'] && bk.overlays['season-2'].order.length > 4000, 'pre-season-3 backup holds season 2 games');
  await p.goto(BASE + 'play.html', { waitUntil: 'networkidle' });
  const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#exportBtn')]);
  const bk2 = JSON.parse(fs.readFileSync(await dl2.path(), 'utf8'));
  ok(bk2.overlays['base:season-3'] && bk2.overlays['base:season-3'].files.games.rows.length === 5475 && bk2.overlays['meta:seasons'], 'backup carries season 3 baseline and season list');
  ok(errs.length === 0, 'no page errors ' + errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: '/tmp/claude-0/shots/s3play.png' });
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('CRASH', e.message); process.exit(1); });
