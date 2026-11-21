"""Builds the soundtrack for the reveal: the commissioner's track looped on the beat, ducked under the reveals, plus synthesized effects.
usage: python3 make_audio.py <plan.json> <music.m4a> <out.wav>
The track is ~180 BPM; its body repeats cleanly every 80 beats. Video t=0 sits on music t=0.203 (beat 0) so every clip start is on a bar line."""
import sys, json, subprocess
import numpy as np

SR = 48000
plan = json.load(open(sys.argv[1])); music_path = sys.argv[2]; out_path = sys.argv[3]
PER = plan["PER"]; clips = plan["clips"]; TOTAL = plan["total"]
T0 = 0.203                      # music time of beat 0 (video t = 0)
LS = T0 + 16 * PER              # loop start (beat 16), phase-aligned
LE = T0 + 96 * PER              # loop end (beat 96): 80 beats of body
XF = 0.30                       # crossfade at loop joins

raw = subprocess.run(["ffmpeg", "-v", "error", "-i", music_path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True).stdout
mus = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()      # (2, n)
print("music loaded", mus.shape[1] / SR, "s")
N = int((TOTAL + 2.0) * SR)
bed = np.zeros((2, N), dtype=np.float32)
def put(dst, src, at):
    a = int(round(at * SR)); b = a + src.shape[-1]
    if a >= dst.shape[-1] or b <= 0: return
    s0 = max(0, -a); dst[..., max(a, 0):min(b, dst.shape[-1])] += src[..., s0:s0 + min(b, dst.shape[-1]) - max(a, 0)]
def seg(a, b): return mus[:, int(round(a * SR)):int(round(b * SR))]
def fade(n, up=True):
    x = np.linspace(0, 1, n, dtype=np.float32); return np.sin(x * np.pi / 2) if up else np.cos(x * np.pi / 2)

# ---- music bed: intro (first 4 bars of the track), then the 80-beat body on repeat, then the track's own ending under the outro
outro = [c for c in clips if c["kind"] == "outro"][0]; T_out = outro["start"]
T_body = 16 * PER                                         # video time where the body begins (the drop)
put(bed, seg(T0, LS), 0.0)
L = LE - LS; t = T_body; first = True
while t < T_out - 1e-6:
    piece_len = min(L, T_out - t)
    body = seg(LS, LS + piece_len + (XF if piece_len == L else 0)).copy()
    n = body.shape[1]; xf = int(XF * SR)
    if not first and n > xf: body[:, :xf] *= fade(xf, True)
    if piece_len == L and n > xf: body[:, -xf:] *= fade(xf, False)
    put(bed, body, t); t += piece_len; first = False
end = seg(LE, LE + outro["dur"] + 3.0).copy(); xf = int(XF * SR); end[:, :xf] *= fade(xf, True)
# the last loop piece ends at T_out with no tail fade-out (the ending takes over); trim any tail we added
put(bed, end, T_out)
fo = int(2.0 * SR); a = int((T_out + outro["dur"] - 0.2) * SR) - fo; bed[:, a:a + fo] *= np.linspace(1, 0, fo, dtype=np.float32); bed[:, a + fo:] = 0

# ---- darker section (last teams out): low-pass the bed there, crossfaded over a second at each edge
d0 = [c for c in clips if c["kind"] == "outsTitle"][0]["start"]; d1 = [c for c in clips if c["kind"] == "outsBoard"][0]; d1 = d1["start"] + d1["dur"]
a, b = int((d0 - 1.0) * SR), int((d1 + 1.0) * SR)
sec = bed[:, a:b]; spec = np.fft.rfft(sec, axis=1); fr = np.fft.rfftfreq(sec.shape[1], 1 / SR)
spec *= (1 / (1 + (fr / 1100.0) ** 4))[None, :]; low = np.fft.irfft(spec, n=sec.shape[1], axis=1).astype(np.float32) * 1.25
w = np.ones(sec.shape[1], dtype=np.float32); ramp = int(1.0 * SR); w[:ramp] = np.linspace(0, 1, ramp); w[-ramp:] = np.linspace(1, 0, ramp)
bed[:, a:b] = sec * (1 - w) + low * w

# ---- ducking envelope (100 Hz): slam dips, reading phases a little lower
G = np.full(int((TOTAL + 2.0) * 100), 0.80, dtype=np.float32)
def dip(t0, depth=.5, tau=.35, dur=1.6):
    i0 = int(t0 * 100); i1 = min(len(G), i0 + int(dur * 100)); x = np.arange(i1 - i0) / 100.0; G[i0:i1] *= 1 - depth * np.exp(-x / tau)
for c in clips:
    if c["kind"] in ("team", "out"):
        read0, read1 = c["start"] + 9 * PER, c["start"] + (c.get("F", c["beats"] - 6)) * PER
        G[int(read0 * 100):int(read1 * 100)] *= 0.78
    for e in c["ev"]:
        if e["k"] in ("slam", "drop", "hit", "lowhit"): dip(c["start"] + e["b"] * PER, .45 if e["k"] != "drop" else .3)
G_s = np.interp(np.arange(N) / SR, np.arange(len(G)) / 100.0, G).astype(np.float32); bed *= G_s[None, :]

# ---- effects (all synthesized)
rng = np.random.default_rng(7)
def env(u, a, d): return np.where(u < 0, 0, np.where(u < a, u / max(a, 1e-6), np.exp(-(u - a) / d)))
def stereo(m, pan=0.0): return np.stack([m * (1 - max(0, pan) * .6), m * (1 + min(0, pan) * .6)]).astype(np.float32)
def boom(f0=42, f1=70, dur=1.2, decay=.55, amp=.9):
    u = np.arange(int(dur * SR)) / SR; ph = 2 * np.pi * (f0 * u + f1 * (1 - np.exp(-9 * u)) / 9); return amp * np.sin(ph) * env(u, .004, decay) + .5 * rng.uniform(-1, 1, len(u)) * env(u, .001, .02)
def noise_band(dur, sweep=1):
    u = np.arange(int(dur * SR)) / SR; k = u / dur; n = rng.uniform(-1, 1, len(u)); return n * (np.sin(np.pi * k) ** 2), k
def ting(f=1760, amp=.25, dur=1.4):
    u = np.arange(int(dur * SR)) / SR; return (np.sin(2 * np.pi * f * u) * .5 + np.sin(2 * np.pi * f * 1.498 * u) * .3 + np.sin(2 * np.pi * f * 2.24 * u) * .12) * env(u, .003, .35) * amp + np.sin(2 * np.pi * 70 * u) * env(u, .004, .25) * .35
def riser(dur=.7, lo=120, hi=1000, amp=.35):
    u = np.arange(int(dur * SR)) / SR; k = u / dur; f = lo + (hi - lo) * k * k; ph = 2 * np.pi * np.cumsum(f) / SR; return (np.sin(ph) * .25 + rng.uniform(-1, 1, len(u)) * .35 * k) * amp * k * k
FX = {
    "slam": lambda: stereo(boom() * .9),
    "drop": lambda: stereo(boom(38, 80, 2.2, .9, 1.0)),
    "hit": lambda: stereo(boom(44, 60, 1.6, .7, .8) + np.pad(ting(1318, .2), (0, 0))[: int(1.6 * SR)] if False else boom(44, 60, 1.6, .7, .8)),
    "lowhit": lambda: stereo(boom(30, 50, 1.8, .8, .9) * .9),
    "ting": lambda: stereo(ting(), .2),
    "whoosh": lambda: (lambda nb: stereo(nb[0] * .24, .6))(noise_band(.75)),
    "whoosh2": lambda: (lambda nb: stereo(nb[0] * .16, -.5))(noise_band(.6)),
    "swish": lambda: (lambda nb: stereo(nb[0] * .10, 0))(noise_band(.45)),
    "riser": lambda: stereo(riser(.75), 0),
    "riserlow": lambda: stereo(riser(.9, 50, 320, .45), 0),
    "tick": lambda: stereo(np.sin(2 * np.pi * 1400 * (np.arange(int(.12 * SR)) / SR)) * env(np.arange(int(.12 * SR)) / SR, .001, .03) * .35),
    "shimmer": lambda: (lambda u: stereo(sum(np.sin(2 * np.pi * f * u + i) for i, f in enumerate((2093, 3136, 4186, 5274))) * env(u, .4, .6) * (.55 + .45 * np.sin(2 * np.pi * 7 * u)) * .05))(np.arange(int(2.2 * SR)) / SR),
}
fx = np.zeros((2, N), dtype=np.float32); count = 0
for c in clips:
    for e in c["ev"]:
        at = c["start"] + e["b"] * PER
        if e["k"] == "riser" or e["k"] == "riserlow": at = at  # risers are placed so they end on the beat after
        put(fx, FX[e["k"]](), max(0.0, at)); count += 1
print("effects placed:", count)
mix = bed + fx * 1.0
peak = float(np.max(np.abs(mix))); mix = np.tanh(mix * 1.35) * .92
pcm = (np.clip(mix, -1, 1).T * 32767).astype("<i2")
import wave
wv = wave.open(out_path, "wb"); wv.setnchannels(2); wv.setsampwidth(2); wv.setframerate(SR); wv.writeframes(pcm.tobytes()); wv.close()
rms = float(np.sqrt(np.mean(mix ** 2))); print("pre-limit peak %.2f | rms %.3f | length %.1fs" % (peak, rms, N / SR))
