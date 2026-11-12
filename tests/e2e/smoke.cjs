// Browser smoke test (needs a running static server on :8000 and Playwright). usage: node tests/e2e/smoke.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:8000/';
const bad = []; let pass = 0;
const ok = (c, m) => { if (c) pass++; else { bad.push(m); console.log('FAIL ' + m); } };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  for (const season of ['season-1', 'season-2']) {
    await ctx.addInitScript((s) => { try { localStorage.setItem('hw-season', s); } catch (e) {} }, season);
    for (const url of ['index.html', 'rankings.html', 'rankings.html#ap', 'standings.html', 'matchup.html?a=virginia&b=duke', 'team.html?t=virginia', 'bracket.html', 'bracketology.html', 'about.html', 'play.html']) {
      const p = await ctx.newPage(); const errs = [];
      p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('requestfailed', r => errs.push('REQFAIL ' + r.url().slice(-50)));
      await p.goto(BASE + url + (url.includes('?') ? '&' : '?') + 's=' + season, { waitUntil: 'networkidle' }); await p.waitForTimeout(url.startsWith('matchup') ? 2500 : 700);
      const txt = await p.locator('main').innerText();
      ok(!/Couldn't load the data/.test(txt), `${season} ${url}: data failed to load`);
      ok(errs.length === 0, `${season} ${url}: console errors ${errs.slice(0, 2).join(' | ')}`);
      ok(txt.length > 150, `${season} ${url}: page looks empty`);
      await p.close();
    }
  }
  await b.close();
  console.log(`\n${pass} checks passed, ${bad.length} failed`); process.exit(bad.length ? 1 : 0);
})();
