// Eight synthesized soundtracks for E21, sample-locked to its frame timeline.
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { createRequire } from "module";
import os from "os";

const require = createRequire(import.meta.url);
const S = require("./spectre-core.js");
const OUT = os.homedir() + "/Desktop/spectre-gifs";
const HERE = ".";
const SR = 44100, FPS = 18;

// ---------- timeline: exact replay of capture-tower6.mjs (E21) ----------
const board = require(HERE + "/tower-board-e15.json").board.t;
const T = 151;
const tileR = board.map(([k, x, y]) => {
  const c = S.tileCentroid({ k, x: x / 1000, y: y / 1000 });
  return Math.hypot(c[0], c[1]);
});
const tileAng = board.map(([k, x, y]) => {
  const c = S.tileCentroid({ k, x: x / 1000, y: y / 1000 });
  return Math.atan2(c[1], c[0]);
});
const shotsAfter = (i) => {
  const p = i / T;
  if (p < 0.45) return i % 2 === 0 ? 1 : 0;
  if (p < 0.70) return 1;
  if (p < 0.85) return 2;
  if (p < 0.93) return 3;
  return 5;
};
const ev = { place: [], remove: [] }; // {f, i}
let f = 4;
for (let i = 0; i < T - 1; i++) { ev.place.push({ f, i }); f += shotsAfter(i); }
const pauseF = f; f += 26;
const summitF = f; ev.place.push({ f, i: T - 1 }); f += 8;
const rotF = f;
const ROT = 200, DISSOLVE_START = 120, HOLD = 85;
const dissolveFrames = (ROT - DISSOLVE_START) + HOLD;
let mFloat = 0, m = 0;
function dStep(k) {
  const approach = ROT - DISSOLVE_START;
  let rate;
  if (k < approach) rate = 48 / approach;
  else {
    const k2 = k - approach, len = HOLD, left = len - k2;
    const base = (T - 1 - 48) / (len * 0.9);
    rate = left < len * 0.3 ? base * Math.max(0.25, left / (len * 0.3)) : base;
  }
  mFloat = Math.min(T - 1, mFloat + rate);
  const next = Math.floor(mFloat);
  if (next !== m) { const gone = []; for (let q = m; q < next; q++) gone.push(q); m = next; return gone; }
  return [];
}
for (let j = 0; j < ROT; j++) {
  if (j >= DISSOLVE_START) for (const q of dStep(j - DISSOLVE_START)) ev.remove.push({ f, i: q });
  f += 1;
}
const landF = f;
for (let k = ROT - DISSOLVE_START; m < T - 1 && k < dissolveFrames + 60; k++) {
  for (const q of dStep(k)) ev.remove.push({ f, i: q });
  f += 1;
}
f += 7;
const summitGoneF = f; ev.remove.push({ f, i: T - 1 }); f += 9;
const TOTAL_F = f;
const DUR = TOTAL_F / FPS;
console.log("timeline:", TOTAL_F, "frames (expect 551),", DUR.toFixed(1) + "s,",
  ev.place.length, "places,", ev.remove.length, "removes; land at", (landF / FPS).toFixed(1) + "s");
const t = (fr) => fr / FPS;
const diveT = t(rotF + 110), landT = t(landF), summitT = t(summitF), pauseT = t(pauseF),
  rotT = t(rotF), endT = t(summitGoneF), blackT = t(TOTAL_F);

// ---------- tiny synth library ----------
const N = Math.ceil(DUR * SR) + 3 * SR;
function buf() { return [new Float32Array(N), new Float32Array(N)]; }
function addTo(dst, src, gain = 1) { for (let c = 0; c < 2; c++) for (let s = 0; s < N; s++) dst[c][s] += src[c][s] * gain; }
function pan(theta) { const p = Math.max(-1, Math.min(1, theta)); return [Math.SQRT1_2 * (1 - p * 0.7), Math.SQRT1_2 * (1 + p * 0.7)]; }
function tilePan(i) { return Math.cos(tileAng[i]) * (tileR[i] / 20); }

function tone(dst, { at, freq, dur, amp = 0.2, panv = 0, partials = [[1, 1]], attack = 0.004, curve = 4, fm = null, drift = 0 }) {
  const st = Math.floor(at * SR), n = Math.floor(dur * SR);
  const [gl, gr] = pan(panv);
  let phase = 0, mphase = 0;
  for (let s = 0; s < n && st + s < N; s++) {
    const tt = s / SR;
    const env = (s < attack * SR ? s / (attack * SR) : Math.exp(-curve * (tt - attack) / dur));
    let fmod = 0;
    if (fm) { mphase += (2 * Math.PI * fm.ratio * freq) / SR; fmod = fm.index * Math.exp(-fm.decay * tt) * Math.sin(mphase); }
    phase += (2 * Math.PI * (freq * (1 + drift * tt))) / SR;
    let v = 0;
    for (const [h, g] of partials) v += g * Math.sin(h * (phase + fmod));
    v *= env * amp;
    dst[0][st + s] += v * gl; dst[1][st + s] += v * gr;
  }
}
function pluck(dst, { at, freq, dur = 0.8, amp = 0.25, panv = 0, damp = 0.5 }) {
  const st = Math.floor(at * SR), n = Math.floor(dur * SR);
  const period = Math.max(2, Math.round(SR / freq));
  const ks = new Float32Array(period);
  let seed = Math.floor(freq * 977) % 2147483647;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647 - 0.5;
  for (let s = 0; s < period; s++) ks[s] = rnd();
  const [gl, gr] = pan(panv);
  for (let s = 0; s < n && st + s < N; s++) {
    const idx = s % period;
    const v = ks[idx] * amp * Math.exp(-2.2 * s / n);
    dst[0][st + s] += v * gl; dst[1][st + s] += v * gr;
    const nxt = (idx + 1) % period;
    ks[idx] = ks[idx] * (1 - damp * 0.5) + ks[nxt] * damp * 0.5;
  }
}
function noiseSweep(dst, { at, dur, amp = 0.2, from = 400, to = 4000, panv = 0, shape = (u) => Math.sin(Math.PI * u) }) {
  const st = Math.floor(at * SR), n = Math.floor(dur * SR);
  let lp = 0, seed = 12345;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647 - 0.5;
  const [gl, gr] = pan(panv);
  for (let s = 0; s < n && st + s < N; s++) {
    const u = s / n;
    const fc = from * Math.pow(to / from, u);
    const a = Math.min(1, (2 * Math.PI * fc) / SR);
    lp += a * (rnd() - lp);
    const v = lp * amp * shape(u) * 3;
    dst[0][st + s] += v * gl; dst[1][st + s] += v * gr;
  }
}
function kick(dst, { at, amp = 0.5, f0 = 130, f1 = 44, dur = 0.28 }) {
  const st = Math.floor(at * SR), n = Math.floor(dur * SR);
  let phase = 0;
  for (let s = 0; s < n && st + s < N; s++) {
    const u = s / n;
    const freq = f0 * Math.pow(f1 / f0, Math.min(1, u * 3));
    phase += (2 * Math.PI * freq) / SR;
    const v = Math.sin(phase) * amp * Math.exp(-5 * u);
    dst[0][st + s] += v * 0.71; dst[1][st + s] += v * 0.71;
  }
}
function hat(dst, { at, amp = 0.12, dur = 0.05, panv = 0 }) {
  const st = Math.floor(at * SR), n = Math.floor(dur * SR);
  let seed = 999, hp = 0, prev = 0;
  const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647 - 0.5;
  const [gl, gr] = pan(panv);
  for (let s = 0; s < n && st + s < N; s++) {
    const w = rnd(); hp = w - prev; prev = w;
    const v = hp * amp * Math.exp(-8 * s / n) * 2;
    dst[0][st + s] += v * gl; dst[1][st + s] += v * gr;
  }
}
function drone(dst, { from, to, freqs, amp = 0.08, lfo = 0.1, riseIn = 2 }) {
  const st = Math.floor(from * SR), en = Math.min(N, Math.floor(to * SR));
  const phases = freqs.map(() => Math.random() * 6.28);
  for (let s = st; s < en; s++) {
    const tt = (s - st) / SR, abs = s / SR;
    let v = 0;
    for (let q = 0; q < freqs.length; q++) {
      phases[q] += (2 * Math.PI * freqs[q]) / SR;
      v += Math.sin(phases[q]) / freqs.length;
    }
    const env = Math.min(1, tt / riseIn) * Math.min(1, (en / SR - abs) / 2);
    const wob = 1 + 0.25 * Math.sin(2 * Math.PI * lfo * tt);
    v *= amp * env * wob;
    dst[0][s] += v; dst[1][s] += v;
  }
}
function echoVerb(dst, mix = 0.22, fb = 0.45) {
  const taps = [0.061, 0.089, 0.127, 0.151];
  for (let c = 0; c < 2; c++) {
    const src = Float32Array.from(dst[c]);
    for (const tp of taps) {
      const d = Math.floor(tp * SR * (c ? 1.07 : 1));
      for (let s = d; s < N; s++) dst[c][s] += (src[s - d] + dst[c][s - d] * fb * 0.4) * (mix / taps.length);
    }
  }
}
function fadeEdges(dst, inS = 0.05, outAt = DUR - 0.4, outLen = 0.4) {
  for (let c = 0; c < 2; c++) {
    for (let s = 0; s < inS * SR; s++) dst[c][s] *= s / (inS * SR);
    const so = Math.floor(outAt * SR);
    for (let s = so; s < N; s++) dst[c][s] *= Math.max(0, 1 - (s - so) / (outLen * SR));
  }
}
const DUR_OUT = DUR + 1.5;
function writeWav(path, dst) {
  let peak = 0;
  for (let c = 0; c < 2; c++) for (let s = 0; s < N; s++) peak = Math.max(peak, Math.abs(dst[c][s]));
  const g = peak > 0.891 ? 0.891 / peak : 1; // -1 dBFS ceiling
  const frames = Math.floor(DUR_OUT * SR);
  const data = Buffer.alloc(44 + frames * 4);
  data.write("RIFF", 0); data.writeUInt32LE(36 + frames * 4, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24); data.writeUInt32LE(SR * 4, 28); data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(frames * 4, 40);
  for (let s = 0; s < frames; s++) {
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(dst[0][s] * g * 32767))), 44 + s * 4);
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(dst[1][s] * g * 32767))), 46 + s * 4);
  }
  writeFileSync(path, data);
  return peak;
}

// scale helpers
const majPent = [0, 2, 4, 7, 9], minPent = [0, 3, 5, 7, 10], major = [0, 2, 4, 5, 7, 9, 11];
const noteHz = (semi, base = 220) => base * Math.pow(2, semi / 12);
const scaleHz = (deg, scale, base = 220) => noteHz(scale[((deg % scale.length) + scale.length) % scale.length] + 12 * Math.floor(deg / scale.length), base);
const degOfTile = (i, span) => Math.round((1 - tileR[i] / 20) * span);

// ---------- S4e ending studies: same song, four different cadences ----------
const variants = {};
const B = 60 / 126;
const BAR = 4 * B;
const beatAt = (tt) => Math.ceil(tt / B) * B;
const q16 = (tt) => Math.round(tt / (B / 4)) * (B / 4);
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const ROOTS = [45, 41, 43, 40];
const PIANO = [[1, 1], [2, 0.35], [3, 0.18], [4, 0.08]];
const HEAD = [ // bars 1-3, unchanged from the version he liked
  [76, 0, 72, 0, 69, 0, 71, 72],
  [74, 0, 72, 71, 69, 0, 65, 0],
  [71, 0, 74, 0, 79, 0, 76, 74],
];
function note(d, at, midi, len, amp = 0.17, panv = 0) {
  tone(d, { at, freq: hz(midi), dur: len * 1.35, amp, partials: PIANO, attack: 0.006, curve: 2.6, panv });
  tone(d, { at: at + 0.006, freq: hz(midi) * 1.002, dur: len * 1.35, amp: amp * 0.4, partials: PIANO, attack: 0.006, curve: 2.6 });
}
function playBars(d, from, bars, amp = 0.17) {
  bars.forEach((bar, bi) => bar.forEach((midi, si) => {
    if (!midi) return;
    let len = B / 2;
    for (let k = si + 1; k < 8 && !bar[k]; k++) len += B / 2;
    note(d, from + (bi * 8 + si) * (B / 2), midi, len, amp, Math.sin(bi + si) * 0.25);
  }));
  return from + bars.length * BAR;
}
function buildSection(d) {
  for (let bt = 0; bt * B < pauseT; bt++) {
    const at = bt * B;
    kick(d, { at, amp: 0.4 });
    if (at > pauseT * 0.3) hat(d, { at: at + B / 2, amp: 0.1, panv: (bt % 2) * 0.6 - 0.3 });
  }
  for (const e of ev.place) {
    if (e.i === T - 1) continue;
    tone(d, { at: q16(t(e.f)), freq: scaleHz(degOfTile(e.i, 10), minPent, 220), dur: 0.16, amp: 0.09, panv: tilePan(e.i), partials: [[1, 1], [2, 0.6], [3, 0.35]], curve: 2 });
  }
  noiseSweep(d, { at: pauseT, dur: summitT - pauseT, amp: 0.14, from: 300, to: 5000, shape: (u) => u });
  kick(d, { at: summitT, amp: 0.6, f0: 110, f1: 40, dur: 0.5 });
}
function grooveChords(d, { from, to }) {
  const start = beatAt(from);
  for (let bt = 0; start + bt * B < to; bt++) {
    const at = start + bt * B;
    kick(d, { at, amp: 0.45 });
    hat(d, { at: at + B / 2, amp: 0.09, panv: (bt % 2) * 0.6 - 0.3 });
    if (bt % 2 === 0) tone(d, { at, freq: hz(ROOTS[Math.floor(bt / 4) % 4] - 12), dur: B * 0.9, amp: 0.2, partials: [[1, 1], [2, 0.5], [3, 0.3]], curve: 1.2 });
  }
}
function removalTicks(d) {
  for (const e of ev.remove) {
    if (e.i === T - 1) continue;
    hat(d, { at: q16(t(e.f)), amp: 0.05, dur: 0.03, panv: -tilePan(e.i) });
  }
}
function common(d) {
  buildSection(d);
  grooveChords(d, { from: summitT + B, to: t(summitGoneF) - 0.1 });
  removalTicks(d);
}
function outroClean(d) {
  tone(d, { at: t(summitGoneF), freq: hz(33), dur: 1.1, amp: 0.22, partials: [[1, 1], [2, 0.3]], attack: 0.01, curve: 3.5 });
  tone(d, { at: t(summitGoneF), freq: hz(45), dur: 1.1, amp: 0.12, partials: PIANO, curve: 3.5 });
}
const FROM = () => beatAt(diveT + 0.4);

variants["S4e2-rise"] = () => { // the cadence climbs: E5 G#5 B5, resolving on a high shining A5
  const d = buf();
  common(d);
  let end = playBars(d, FROM(), HEAD);
  end = playBars(d, end, [[76, 0, 80, 0, 83, 0, 0, 0]]);
  note(d, end, 81, 2.2, 0.2);
  note(d, end, 69, 2.2, 0.09); // octave support
  tone(d, { at: end, freq: hz(57), dur: 2.2, amp: 0.08, partials: PIANO, curve: 2 });
  outroClean(d);
  echoVerb(d, 0.16, 0.4);
  return d;
};

variants["S4e3-cascade"] = () => { // the ending is a two-octave falling piano run onto a deep A
  const d = buf();
  common(d);
  const end = playBars(d, FROM(), HEAD);
  const run = [76, 74, 72, 71, 69, 67, 65, 64, 62, 60, 59, 57, 55, 53, 52, 50, 48, 47];
  run.forEach((midi, q) => note(d, end + q * (B / 4), midi, B / 3, 0.15 - q * 0.003, (q % 2) * 0.5 - 0.25));
  const landAt = end + run.length * (B / 4);
  note(d, landAt, 45, 2.0, 0.22);
  tone(d, { at: landAt, freq: hz(33), dur: 2.0, amp: 0.15, partials: [[1, 1], [2, 0.4]], curve: 1.8 });
  outroClean(d);
  echoVerb(d, 0.16, 0.4);
  return d;
};

variants["S4e4-question"] = () => { // refuses to resolve: ends suspended on the fifth
  const d = buf();
  common(d);
  let end = playBars(d, FROM(), HEAD);
  end = playBars(d, end, [[76, 75, 71, 0, 74, 0, 0, 0]]);
  note(d, end, 76, 2.4, 0.18);
  note(d, end, 71, 2.4, 0.08);
  outroClean(d);
  echoVerb(d, 0.18, 0.45);
  return d;
};

variants["S4e5-memory"] = () => { // resolves, then the opening motif echoes twice, fading with the tiles
  const d = buf();
  common(d);
  const from = FROM() - BAR; // the theme enters a bar early, as the descent begins
  let end = playBars(d, from, HEAD);
  end = playBars(d, end, [[76, 75, 71, 0, 68, 0, 0, 0]]);
  end = playBars(d, end, [[69, 0, 0, 0, 76, 0, 72, 0]]); // resolve, then the echo begins
  note(d, end, 69, 2.0, 0.12);
  note(d, end + B, 76, 0.5, 0.07, 0.3);
  note(d, end + 1.5 * B, 72, 0.5, 0.05, -0.3);
  note(d, end + 2 * B, 69, 1.2, 0.04);
  outroClean(d);
  echoVerb(d, 0.2, 0.48);
  return d;
};


// the chosen ending, with room to breathe: the high A5 and the closing chord decay
// naturally into the extended black
variants["S4e2-final"] = () => {
  const d = buf();
  common(d);
  let end = playBars(d, FROM(), HEAD);
  end = playBars(d, end, [[76, 0, 80, 0, 83, 0, 0, 0]]);
  note(d, end, 81, 3.2, 0.2);
  note(d, end, 69, 3.2, 0.09);
  tone(d, { at: end, freq: hz(57), dur: 3.2, amp: 0.08, partials: PIANO, curve: 2 });
  tone(d, { at: t(summitGoneF), freq: hz(33), dur: 2.2, amp: 0.22, partials: [[1, 1], [2, 0.3]], attack: 0.01, curve: 2.6 });
  tone(d, { at: t(summitGoneF), freq: hz(45), dur: 2.2, amp: 0.12, partials: PIANO, curve: 2.6 });
  echoVerb(d, 0.16, 0.4);
  return d;
};
{
  const d = variants["S4e2-final"]();
  fadeEdges(d, 0.05, DUR_OUT - 0.55, 0.45);
  const peak = writeWav(`${HERE}/S4e2-final.wav`, d);
  console.log("S4e2-final wav done (peak " + peak.toFixed(2) + ", " + DUR_OUT.toFixed(2) + "s)");
}
