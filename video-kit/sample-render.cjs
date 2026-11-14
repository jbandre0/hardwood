// Renders reveal.html frame by frame (1920x1080, 30 fps) to frames/NNNN.png.
// usage: node render.cjs [fps] [start] [end]   (or: node render.cjs preview t1 t2 ... to dump single frames)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const DIR = __dirname, BASE = process.env.BASE || 'http://localhost:8001/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
  await p.goto(BASE + 'reveal.html'); await p.evaluate(() => window.ready);
  const args = process.argv.slice(2);
  if (args[0] === 'preview') {
    for (const t of args.slice(1)) { await p.evaluate((t) => window.render(t), +t); await p.screenshot({ path: path.join(DIR, `preview-${t}.png`) }); }
  } else {
    const fps = +(args[0] || 30), start = +(args[1] || 0), end = +(args[2] || 14);
    const n0 = Math.round(start * fps), n1 = Math.round(end * fps);
    fs.mkdirSync(path.join(DIR, 'frames'), { recursive: true });
    const t0 = Date.now();
    for (let n = n0; n < n1; n++) {
      await p.evaluate((t) => window.render(t), n / fps);
      await p.screenshot({ path: path.join(DIR, 'frames', String(n).padStart(4, '0') + '.png') });
      if (n % 60 === 0) console.log(`frame ${n}/${n1} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    console.log('done', n1 - n0, 'frames');
  }
  await b.close();
})();
