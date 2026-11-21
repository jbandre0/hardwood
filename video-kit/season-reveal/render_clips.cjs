// Renders every clip of plan.json to clips/clip-NNN.mp4 (1920x1080, 30 fps), piping frames straight into ffmpeg (no frames on disk).
// Resumable: existing clips are skipped. usage: node render_clips.cjs <data dir name> <outdir> <workers> [only-clip-numbers comma list]
const { chromium } = require('playwright'); const { spawn, fork } = require('child_process'); const fs = require('fs'), path = require('path');
const FPS = 30, [, , D, OUT, NW, ONLY] = process.argv; const nw = +NW || 4;
const plan = JSON.parse(fs.readFileSync(path.join(__dirname, 'web', D, 'plan.json')));
const only = ONLY && ONLY !== 'all' ? new Set(ONLY.split(',').map(Number)) : null;
const frameRange = (c) => { const f0 = Math.round(c.start * FPS), f1 = Math.round((c.start + c.dur) * FPS); return [f0, f1]; };
if (process.env.WORKER_ID === undefined) {   // coordinator
  fs.mkdirSync(OUT, { recursive: true }); let done = 0; const t0 = Date.now(); const ws = [];
  for (let i = 0; i < nw; i++) { const w = fork(__filename, process.argv.slice(2), { env: { ...process.env, WORKER_ID: String(i) } }); ws.push(new Promise((res) => w.on('exit', (code) => res(code)))); }
  Promise.all(ws).then((codes) => { console.log('workers exited', codes.join(','), ((Date.now() - t0) / 1000 / 60).toFixed(1), 'min'); process.exit(codes.some((c) => c) ? 1 : 0); });
} else {
  (async () => {
    const id = +process.env.WORKER_ID, b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    p.on('pageerror', (e) => { console.error('PAGE ERROR', e.message); process.exitCode = 1; });
    await p.goto(`http://localhost:8011/index.html?d=${D}`); await p.evaluate(() => window.ready);
    const mine = plan.clips.filter((c) => c.n % nw === id && (!only || only.has(c.n)));
    for (const c of mine) {
      const file = path.join(OUT, `clip-${String(c.n).padStart(3, '0')}.mp4`); if (fs.existsSync(file)) continue;
      const [f0, f1] = frameRange(c), tmp = file + '.part.mp4';
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
      const closed = new Promise((res) => ff.on('close', res)); const t0 = Date.now();
      for (let f = f0; f < f1; f++) {
        const s = Math.max(0, f / FPS - c.start); await p.evaluate(([n, s]) => window.render(n, s), [c.n, Math.min(s, c.dur - 1e-3)]);
        const buf = await p.screenshot({ type: 'jpeg', quality: 93 }); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      }
      ff.stdin.end(); const code = await closed; if (code) { console.error('ffmpeg failed for clip', c.n); process.exit(1); }
      fs.renameSync(tmp, file); console.log(`w${id} clip ${c.n} ${c.kind} ${f1 - f0}f ${((f1 - f0) / ((Date.now() - t0) / 1000)).toFixed(1)}fps`);
    }
    const warn = await p.evaluate(() => window.warnings); if (warn.length) console.log(`w${id} warnings (${warn.length}):`, JSON.stringify(warn).slice(0, 300));
    await b.close();
  })();
}
