// Hardwood Sim engine v9: possession-by-possession Monte Carlo basketball.
// Faithful JS port of tools/ref/hoops_engine.py (the workbook's own Python copy).
// Pure ES module, no DOM, runs in Node (tests) and in a Web Worker (site).
//
// A "team row" is the 26-column engine input array exported from the workbook:
//  0 Team 1 Conf 2 Games 3 PPG 4 REB 5 ST 6 BL 7 TO 8 FT% 9 3P% 10 OR 11 DR 12 FTA
//  13 FGA 14 2P% 15 OEFG% 16 STR*Ra 17 HFA*Ra 18 POSS 19 OppOR/G 20 OppeFG% 21 Opp2P%
//  22 Opp3P% 23 OppTO% 24 OppFTA/FGA 25 FTA/FGA

export const CAL = {
  vk: 12.5, fl: 4800, st: 5766, to: 1075, orb: 3381, clk: 1.075, z3: 4490, sto: 211,
  sor: 335, sst: 0, soa: 386, B24: 8.958, w2: 0.72, w3: 0.25, avgopp2: 51.87, avgopp3: 33.95,
  ftr_avg: 0.3523, toint: 6.755, toslope: 1.419, fm: 1.83, tow: 45, sU: 0, norm: 1,
  Pavg: 0.318129994587758, pf0: 0.471649367142857, Uavg: 0.557590571428571,
  ofr_avg: 0.3502, ofm: 1.67,
};
// Home court (v9): mirrors Calibration!K45:K50 and Engine!BF
export const HOME = { k2: 0.93, k3: 0.34, kTO: -45, kFT: 0.11, w: 0.5, HAVG: 3.70147058823529 };
CAL.kFT = HOME.kFT;
CAL.kTO = HOME.kTO;

// seconds per outcome code, before the clock scale
const SECN = new Float64Array(30);
{
  const m = { 1: 13, 2: 13, 3: 13, 4: 12, 5: 12, 6: 9, 7: 17, 8: 17, 9: 16, 10: 16, 11: 24, 12: 23, 13: 24, 14: 23,
    15: 21, 16: 20, 17: 21, 18: 20, 19: 16, 20: 17, 21: 17, 22: 20, 23: 20, 24: 13, 25: 18, 26: 18, 27: 17, 28: 17, 29: 30 };
  for (const k in m) SECN[k] = m[k];
}
const SECS = SECN.map((s) => s * CAL.clk);
// points per outcome code
const PT = new Int8Array(30);
{
  const m = { 1: 1, 2: 2, 7: 3, 9: 2, 11: 3, 12: 3, 15: 2, 16: 2, 19: 2, 20: 2, 22: 3, 25: 3, 27: 2 };
  for (const k in m) PT[k] = m[k];
}

// ---------- seeded RNG: splitmix32 -> xoshiro128** ----------
export function makeRng(seed = 1) {
  let s = seed >>> 0;
  const sm = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  let a = sm(), b = sm(), c = sm(), d = sm();
  const rotl = (x, k) => (x << k) | (x >>> (32 - k));
  return function rand() {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t; d = rotl(d, 11);
    return r / 4294967296;
  };
}

// ---------- team profile ----------
export function profile(row) {
  const G = row[2];
  const STR = row[16];
  const X = ((STR - 4) - 4) / 1.6 / 100 + 1;
  const L = row[10] / G;
  const T = row[11] / G;
  const U = (T * (row[6] / 3.5)) / 100 + 0.32;
  const V = U * (row[15] / 100) * ((row[5] / row[18]) * CAL.vk);
  return {
    name: row[0], D: row[3], M: row[18], P: row[7], I0: row[9] * X, H0: row[14] * X, J: row[8],
    L, U, Q: row[5], V, oa: row[19], oP2: row[21], oP3: row[22], oTO: row[23], oFT: row[24],
    ownFT: row[25], hfa: row[17],
  };
}

// offense `o` against defense `d`: shooting adjusted by the defense's % allowed
function offense(o, d) {
  return {
    ...o,
    H: o.H0 + CAL.w2 * (d.oP2 - CAL.avgopp2),
    I: o.I0 + CAL.w3 * (d.oP3 - CAL.avgopp3),
    hf: 0,
  };
}

// precompute every threshold that depends only on (offense, defense)
function side(o, d) {
  const C = CAL;
  const AH_ = d.V * (2 - o.D / o.M);
  const AI_ = Math.min(9500,
    (C.fl - 1450 * (C.Uavg - 0.5) - C.sU * (d.U - C.Uavg)) * (C.Pavg / AH_) *
    (1 + C.fm * (d.oFT - C.ftr_avg) + C.ofm * (o.ownFT - C.ofr_avg) + C.kFT * o.hf));
  const stt0 = C.st - (6.4 - d.Q) * C.sst;
  const AJ_ = stt0 * ((1 - C.pf0) / (1 - AI_ / 10000));
  const AK_ = 23 * (((1 - C.pf0) * (1 - stt0 / 10000)) / ((1 - AI_ / 10000) * (1 - Math.min(AJ_, 9500) / 10000)));
  const AL_ = C.tow * (d.oTO - (C.toint + C.toslope * d.Q)) + C.kTO * o.hf;
  return {
    I: o.I, H: o.H, J: o.J, AH_, AI_, AJ_, AK_,
    toThr: C.to - (13.1 - o.P) * C.sto + AL_,
    orThr: C.orb - (8.4 - o.L) * C.sor - (C.B24 - d.oa) * C.soa,
    z3: C.z3,
  };
}

// one possession -> outcome code (1..29); sets lastFM = "first free throw made" flag
let lastFM = false;
function possession(s, rand) {
  const Y = rand();
  const Z = rand() * 10000, AA = rand() * 7, AC = rand() * 10000, AD = rand() * 1000;
  const AB = rand() * 100, AE = rand() * 100, AF = rand() * 100, AG = rand() * 100;
  const AH = rand() * 100, AI = rand() * 100, AJ = rand() * 100, AK = rand() * 100;
  const { I, H, J } = s;
  lastFM = AG < J;
  if (Y > s.AH_) {
    // normal branch
    if (Z < s.toThr) return AA < 4 ? 4 : 5;
    if (Z < s.z3) {
      if (AB < I) return 7;
      if (AC < s.orThr) {
        if (AD < 10) return 19;
        if (AD < 386) return AE < I ? 11 : 13;
        return AE < H ? 15 : 17;
      }
      return 8;
    }
    if (AB < H) return 9;
    if (AC < s.orThr) {
      if (AD < 10) return 19;
      if (AD < 386) return AE < I ? 12 : 14;
      return AE < H ? 16 : 18;
    }
    return 10;
  }
  // defensive-event branch
  if (Z < s.AI_) {
    const ftor = () => (AJ < 75 ? (AE < H ? 20 : 21) : (AE < I ? 22 : 23));
    if (AF < 72) {
      if (AG < J) return AH < J ? 2 : AI < 80 ? 1 : ftor();
      return AH < J ? 1 : AI < 80 ? 3 : ftor();
    }
    if (AG < J) return AH < J ? 2 : AI < 80 ? 1 : ftor();
    return AI < 80 ? 24 : ftor();
  }
  if (AC < s.AJ_) return 6;
  if (AK < s.AK_) return 29;
  if (AD < 10) return 19;
  if (AD < 386) return AE < I ? 25 : 26;
  return AE < H ? 27 : 28;
}

// build the two matchup sides (with optional home court)
export function matchup(rowA, rowB, venue = "neutral") {
  const a = profile(rowA), b = profile(rowB);
  const Ao = offense(a, b), Bo = offense(b, a);
  if (venue === "A_home" || venue === "B_home") {
    const home = venue === "A_home" ? a : b;
    const sc = 1 + HOME.w * (home.hfa / HOME.HAVG - 1);
    const sgA = venue === "A_home" ? 1 : -1;
    for (const [o, sg] of [[Ao, sgA], [Bo, -sgA]]) {
      o.hf = sg * sc;
      o.H += HOME.k2 * sg * sc;
      o.I += HOME.k3 * sg * sc;
    }
  }
  return { a, b, sA: side(Ao, b), sB: side(Bo, a) };
}

// Play one game. `first` = which side has the opening possession ("A"|"B").
// Matches the Python engine (no overtime). Returns [pointsA, pointsB, possessions?]
function playRegulation(m, rand, first, keepLog) {
  const MAXP = 260;
  let clock = 2400, ptsA = 0, ptsB = 0;
  const log = keepLog ? [] : null;
  let aTurn = first === "A";
  for (let k = 0; k < MAXP; k++) {
    if (k > 0 && clock < 1) break;
    const s = aTurn ? m.sA : m.sB;
    const c = possession(s, rand);
    let p = PT[c] + (c >= 20 && c <= 23 && lastFM ? 1 : 0);
    const before = clock;
    clock -= SECS[c];
    if (aTurn) ptsA += p; else ptsB += p;
    if (log) log.push({ t: before, side: aTurn ? "A" : "B", code: c, pts: p, a: ptsA, b: ptsB });
    aTurn = !aTurn;
  }
  return log ? [ptsA, ptsB, log] : [ptsA, ptsB];
}

// Overtime (site only; the v9 predictor treats ties as 0.5 like the workbook's Python copy)
function playOvertime(m, rand, ptsA, ptsB, keepLog) {
  const log = [];
  let n = 0;
  while (ptsA === ptsB && n < 8) {
    n++;
    let clock = 300, aTurn = rand() < 0.5;
    for (let k = 0; k < 60 && (k === 0 || clock >= 1); k++) {
      const s = aTurn ? m.sA : m.sB;
      const c = possession(s, rand);
      const p = PT[c] + (c >= 20 && c <= 23 && lastFM ? 1 : 0);
      const before = clock;
      clock -= SECS[c];
      if (aTurn) ptsA += p; else ptsB += p;
      if (keepLog) log.push({ t: before, side: aTurn ? "A" : "B", code: c, pts: p, a: ptsA, b: ptsB, ot: n });
      aTurn = !aTurn;
    }
  }
  return [ptsA, ptsB, n, log];
}

// Predict a matchup: n simulated games, half with each side holding the opening possession.
export function predict(rowA, rowB, venue = "neutral", { n = 40000, seed = 1, hist = true } = {}) {
  const m = matchup(rowA, rowB, venue);
  const rand = makeRng(seed);
  let wins = 0, ties = 0, sumM = 0, sumM2 = 0, sumT = 0, sumA = 0, sumB = 0;
  const HB = 60; // margin histogram: -60..+60 (anything beyond is clipped into the end bins)
  const h = new Uint32Array(HB * 2 + 1);
  const half = Math.floor(n / 2);
  for (let g = 0; g < half * 2; g++) {
    const [pa, pb] = playRegulation(m, rand, g < half ? "B" : "A", false);
    const d = pa - pb;
    if (d > 0) wins++; else if (d === 0) ties++;
    sumM += d; sumM2 += d * d; sumT += pa + pb; sumA += pa; sumB += pb;
    if (hist) h[Math.max(-HB, Math.min(HB, d)) + HB]++;
  }
  const N = half * 2, mean = sumM / N;
  return {
    p: (wins + 0.5 * ties) / N,
    margin: mean,
    total: sumT / N,
    sd: Math.sqrt(Math.max(0, sumM2 / N - mean * mean)),
    scoreA: sumA / N,
    scoreB: sumB / N,
    n: N,
    hist: hist ? Array.from(h) : undefined,
  };
}

// Play one full game for display: final score, OT count and the possession log.
export function playGame(rowA, rowB, venue = "neutral", { seed = (Math.random() * 2 ** 32) >>> 0 } = {}) {
  const m = matchup(rowA, rowB, venue);
  const rand = makeRng(seed);
  const first = rand() < 0.5 ? "A" : "B";
  let [pa, pb, log] = playRegulation(m, rand, first, true);
  const [fa, fb, ot, otLog] = playOvertime(m, rand, pa, pb, true);
  if (ot) log = log.concat(otLog);
  return { scoreA: fa, scoreB: fb, ot, first, log, seed };
}
