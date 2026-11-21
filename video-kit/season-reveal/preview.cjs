// usage: node preview.cjs <data dir name> <outdir> n:t [n:t ...]   -> outdir/f-<n>-<t>.png
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const [d, outDir, ...pairs] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('PAGE ERROR', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.error('console error', m.text()); });
  await p.goto(`http://localhost:8011/index.html?d=${d}`); await p.evaluate(() => window.ready);
  for (const pr of pairs) { const [n, t] = pr.split(':').map(Number); await p.evaluate(([n, t]) => window.render(n, t), [n, t]); await p.screenshot({ path: path.join(outDir, `f-${String(n).padStart(2, '0')}-${String(t).replace('.', '_')}.png`) }); }
  console.log('warnings:', JSON.stringify(await p.evaluate(() => window.warnings)).slice(0, 600)); await b.close();
})();
