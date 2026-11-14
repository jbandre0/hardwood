// Synthesizes the soundtrack as a 48 kHz stereo WAV: a low arena drone, a riser into each reveal, a sub "boom" on each
// seed slam, a whoosh on the logo streak, a glassy "ting" when the team lands in the bracket. No samples, pure math.
const fs = require('fs');
const SR = 48000, DUR = 14.0, N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);
const add = (fn) => { for (let i = 0; i < N; i++) { const t = i / SR; const [l, r] = fn(t); L[i] += l; R[i] += r; } };
let seed = 7; const noise = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed / 4294967296) * 2 - 1; };
const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));
// drone: two detuned sines + slow tremolo, swelling slightly at each scene start
add((t) => { const sw = .35 + .25 * Math.sin(t * .8) + (t % 7 < 1 ? .2 * (1 - (t % 7)) : 0); const v = (Math.sin(2 * Math.PI * 55 * t) + .6 * Math.sin(2 * Math.PI * 82.4 * t + .3) + .3 * Math.sin(2 * Math.PI * 110 * t)) * .08 * sw; return [v, v]; });
for (const base of [0, 7]) {
  const slam = base + .9, logo = base + 1.6, land = base + 5.1;
  // riser: filtered noise + rising sine sweep over the 0.9 s before the slam
  add((t) => { const u = t - base; if (u < 0 || u > .9) return [0, 0]; const k = u / .9; const f = 120 + 900 * k * k; const v = (Math.sin(2 * Math.PI * f * u) * .25 + noise() * .35 * k) * .35 * k * k; return [v * (1 - k * .3), v * (.7 + k * .3)]; });
  // boom: sub sine with pitch drop + click
  add((t) => { const u = t - slam; if (u < 0) return [0, 0]; const f = 42 + 70 * Math.exp(-u * 9); const v = Math.sin(2 * Math.PI * f * u) * env(u, .004, .55) * .9 + noise() * env(u, .001, .02) * .5; return [v, v]; });
  // whoosh for the logo streak (noise band sweeping right to left)
  add((t) => { const u = t - logo; if (u < -.25 || u > .5) return [0, 0]; const k = (u + .25) / .75; const v = noise() * .22 * Math.sin(Math.PI * k) ** 2; return [v * k, v * (1 - k)]; });
  // bracket land: glassy ting (two high partials) + soft thud
  add((t) => { const u = t - land; if (u < 0) return [0, 0]; const v = (Math.sin(2 * Math.PI * 1760 * u) * .5 + Math.sin(2 * Math.PI * 2637 * u) * .3) * env(u, .003, .35) * .25 + Math.sin(2 * Math.PI * 70 * u) * env(u, .004, .25) * .5; return [v, v]; });
}
// final hit on the VS lockup
add((t) => { const u = t - 13.0; if (u < 0) return [0, 0]; const v = Math.sin(2 * Math.PI * (48 + 60 * Math.exp(-u * 8)) * u) * env(u, .004, .7) * .8; return [v, v]; });
// soft limiter + fade out
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > DUR - .6 ? (DUR - t) / .6 : 1;
  const l = Math.tanh(L[i] * 1.6) * .95 * fade, r = Math.tanh(R[i] * 1.6) * .95 * fade;
  out.writeInt16LE(Math.round(l * 32767), 44 + i * 4); out.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}
fs.writeFileSync(__dirname + '/soundtrack.wav', out); console.log('wrote soundtrack.wav', (out.length / 1e6).toFixed(1), 'MB');
