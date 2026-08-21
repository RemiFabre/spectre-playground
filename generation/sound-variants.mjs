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
const N = Math.ceil(DUR * SR) + SR;
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
function writeWav(path, dst) {
  let peak = 0;
  for (let c = 0; c < 2; c++) for (let s = 0; s < N; s++) peak = Math.max(peak, Math.abs(dst[c][s]));
  const g = peak > 0.891 ? 0.891 / peak : 1; // -1 dBFS ceiling
  const frames = Math.floor(DUR * SR);
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

// ---------- the eight scores ----------
const variants = {};

variants["S1-plucks"] = () => { // radius-tuned plucked strings; dissolve replies in minor
  const d = buf();
  for (const e of ev.place) {
    const i = e.i;
    if (i === T - 1) { tone(d, { at: t(e.f), freq: 55, dur: 3, amp: 0.4, partials: [[1, 1], [2, 0.4], [3, 0.15]], curve: 3 }); continue; }
    pluck(d, { at: t(e.f), freq: scaleHz(degOfTile(i, 12), majPent, 165), amp: 0.22, panv: tilePan(i) });
  }
  for (const e of ev.remove) {
    const i = e.i;
    if (i === T - 1) { tone(d, { at: t(e.f), freq: 55, dur: 2.5, amp: 0.35, partials: [[1, 1], [2, 0.3]], curve: 2.5, drift: -0.04 }); continue; }
    pluck(d, { at: t(e.f), freq: scaleHz(degOfTile(i, 12) - 2, minPent, 110), amp: 0.13, panv: -tilePan(i), damp: 0.75 });
  }
  drone(d, { from: rotT, to: landT + 2, freqs: [55, 55.4, 82.5], amp: 0.05 });
  echoVerb(d, 0.18);
  return d;
};

variants["S2-musicbox"] = () => { // FM celesta, gentle; a slow lullaby under the orbit
  const d = buf();
  for (const e of ev.place) {
    const i = e.i;
    const amp = i === T - 1 ? 0.35 : 0.14;
    tone(d, { at: t(e.f), freq: scaleHz(degOfTile(i, 9) + 5, majPent, 330), dur: 1.4, amp, panv: tilePan(i), fm: { ratio: 3.01, index: 4, decay: 3 }, curve: 3.5 });
  }
  const lull = [0, 4, 2, 4, 0, -3, -1, 2];
  lull.forEach((deg, q) => tone(d, { at: rotT + 0.4 + q * 1.1, freq: scaleHz(deg, majPent, 220), dur: 1.6, amp: 0.12, fm: { ratio: 2, index: 1.5, decay: 2 }, curve: 2.5 }));
  for (const e of ev.remove) {
    if (e.i === T - 1) continue;
    tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 9) + 3, minPent, 330), dur: 1.0, amp: 0.07, panv: -tilePan(e.i), fm: { ratio: 3.01, index: 3, decay: 4 }, curve: 4.5 });
  }
  tone(d, { at: t(summitGoneF), freq: 110, dur: 2.6, amp: 0.2, fm: { ratio: 2, index: 2, decay: 1.5 }, curve: 2.2 });
  echoVerb(d, 0.25, 0.5);
  return d;
};

variants["S3-cinematic"] = () => { // ambient score: swells, a whoosh into the dive, hush at the end
  const d = buf();
  drone(d, { from: 0, to: summitT, freqs: [110, 110.5, 164.8, 220.7], amp: 0.07, lfo: 0.07, riseIn: 5 });
  for (const e of ev.place) {
    if (e.i === T - 1) continue;
    if (e.i % 3 === 0) tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 7), majPent, 440), dur: 0.5, amp: 0.05, panv: tilePan(e.i), partials: [[1, 1], [2, 0.2]] });
  }
  noiseSweep(d, { at: pauseT - 0.1, dur: summitT - pauseT + 0.1, amp: 0.10, from: 200, to: 2400, shape: (u) => u * u });
  kick(d, { at: summitT, amp: 0.55, f0: 90, f1: 36, dur: 0.9 });
  drone(d, { from: summitT, to: landT + 1, freqs: [55, 55.3, 82.4, 110.6, 165.2], amp: 0.1, lfo: 0.05, riseIn: 1.5 });
  noiseSweep(d, { at: diveT - 0.4, dur: 2.6, amp: 0.16, from: 3000, to: 250 });
  drone(d, { from: landT, to: endT, freqs: [220, 220.8, 330.5], amp: 0.05, lfo: 0.12, riseIn: 2 });
  tone(d, { at: t(summitGoneF), freq: 55, dur: 2.8, amp: 0.3, partials: [[1, 1], [2, 0.3], [4, 0.08]], curve: 2 });
  echoVerb(d, 0.3, 0.55);
  return d;
};

variants["S4-techno"] = () => { // a build-up that drops at the summit, dies with the dissolve
  const d = buf();
  const B = 60 / 126;
  for (let bt = 0; bt * B < endT - 1; bt++) {
    const at = bt * B;
    const inBuild = at < pauseT, afterDrop = at >= summitT && at < landT;
    if (at < pauseT || afterDrop) kick(d, { at, amp: at < pauseT ? 0.4 : 0.5 });
    if ((inBuild && at > pauseT * 0.3) || afterDrop) hat(d, { at: at + B / 2, amp: 0.1, panv: (bt % 2) * 0.6 - 0.3 });
    if (afterDrop && bt % 2 === 0) tone(d, { at, freq: 55, dur: B * 0.9, amp: 0.22, partials: [[1, 1], [2, 0.5], [3, 0.3]], curve: 1.2 });
  }
  for (const e of ev.place) { // placements ride as a quantized arp
    if (e.i === T - 1) continue;
    const at = Math.round(t(e.f) / (B / 4)) * (B / 4);
    tone(d, { at, freq: scaleHz(degOfTile(e.i, 10), minPent, 220), dur: 0.16, amp: 0.09, panv: tilePan(e.i), partials: [[1, 1], [2, 0.6], [3, 0.35]], curve: 2 });
  }
  noiseSweep(d, { at: pauseT, dur: summitT - pauseT, amp: 0.14, from: 300, to: 5000, shape: (u) => u });
  kick(d, { at: summitT, amp: 0.6, f0: 110, f1: 40, dur: 0.5 });
  let q = 0;
  for (const e of ev.remove) { // dissolve: the arp descends, everything filters away
    if (e.i === T - 1) continue;
    if (q++ % 2 === 0) tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 10) - 5, minPent, 110), dur: 0.2, amp: 0.08 * Math.max(0.2, 1 - (t(e.f) - diveT) / 10), partials: [[1, 1], [2, 0.4]] });
  }
  return d;
};

variants["S5-pi-melody"] = () => { // the digits of pi sing as the glyph is revealed
  const d = buf();
  for (const e of ev.place) {
    if (e.i === T - 1) { tone(d, { at: t(e.f), freq: 65.4, dur: 2.5, amp: 0.35, partials: [[1, 1], [2, 0.4]], curve: 2.5 }); continue; }
    pluck(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 12), majPent, 165), amp: 0.16, panv: tilePan(e.i) });
  }
  drone(d, { from: rotT, to: endT, freqs: [65.4, 65.8, 98.2], amp: 0.06, riseIn: 2 });
  const digits = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3, 2, 3, 8, 4];
  const step = (endT - (diveT + 0.5)) / digits.length;
  digits.forEach((dig, qq) => {
    tone(d, { at: diveT + 0.5 + qq * step, freq: scaleHz(dig, major, 262), dur: step * 1.5, amp: 0.18, partials: [[1, 1], [3, 0.12]], attack: 0.02, curve: 2.5, panv: (qq % 2) * 0.5 - 0.25 });
  });
  tone(d, { at: t(summitGoneF), freq: 130.8, dur: 2.2, amp: 0.2, fm: { ratio: 2, index: 2, decay: 2 }, curve: 2 });
  echoVerb(d, 0.22, 0.5);
  return d;
};

variants["S6-zen"] = () => { // water drops, wind, one gong for the summit
  const d = buf();
  for (const e of ev.place) {
    if (e.i === T - 1) { tone(d, { at: t(e.f), freq: 82, dur: 4, amp: 0.4, partials: [[1, 1], [2.76, 0.5], [5.4, 0.25], [8.9, 0.1]], curve: 1.6 }); continue; }
    tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 8) + 4, majPent, 523), dur: 0.35, amp: 0.11, panv: tilePan(e.i), drift: -0.5, curve: 5 });
  }
  noiseSweep(d, { at: 0, dur: DUR - 1, amp: 0.03, from: 300, to: 700, shape: (u) => 0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * u) });
  noiseSweep(d, { at: diveT - 0.3, dur: 2.2, amp: 0.1, from: 2500, to: 300 });
  for (const e of ev.remove) {
    if (e.i === T - 1) continue;
    if (e.i % 3 === 0) tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 8), minPent, 262), dur: 0.5, amp: 0.06, panv: -tilePan(e.i), drift: -0.3, curve: 5 });
  }
  tone(d, { at: t(summitGoneF), freq: 65, dur: 3.5, amp: 0.3, partials: [[1, 1], [2.76, 0.4], [5.4, 0.15]], curve: 1.4, drift: -0.02 });
  echoVerb(d, 0.28, 0.55);
  return d;
};

variants["S7-chiptune"] = () => { // 8-bit: square blips, glissando dive, fading arps
  const sq = [[1, 1], [3, 0.33], [5, 0.2], [7, 0.14]];
  const d = buf();
  for (const e of ev.place) {
    if (e.i === T - 1) { tone(d, { at: t(e.f), freq: 110, dur: 0.9, amp: 0.3, partials: sq, curve: 1.5 }); tone(d, { at: t(e.f) + 0.12, freq: 220, dur: 0.7, amp: 0.2, partials: sq }); continue; }
    tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 14) + 7, majPent, 220), dur: 0.09, amp: 0.13, panv: tilePan(e.i), partials: sq, curve: 1.2 });
  }
  const B = 60 / 140;
  for (let bt = 0; bt * B < pauseT; bt++) if (bt % 4 < 2) tone(d, { at: bt * B, freq: bt % 8 < 4 ? 55 : 65.4, dur: B * 0.8, amp: 0.12, partials: sq, curve: 1 });
  for (let g = 0; g < 22; g++) tone(d, { at: diveT + g * 0.06, freq: 880 * Math.pow(0.5, g / 8), dur: 0.07, amp: 0.12, partials: sq });
  for (const e of ev.remove) {
    if (e.i === T - 1) continue;
    if (e.i % 2 === 0) tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 14), minPent, 220), dur: 0.07, amp: 0.09 * Math.max(0.15, 1 - (t(e.f) - diveT) / 9), partials: sq, curve: 1.2 });
  }
  tone(d, { at: t(summitGoneF), freq: 110, dur: 0.5, amp: 0.2, partials: sq }); // game over
  tone(d, { at: t(summitGoneF) + 0.18, freq: 82, dur: 0.5, amp: 0.2, partials: sq });
  tone(d, { at: t(summitGoneF) + 0.36, freq: 55, dur: 0.9, amp: 0.22, partials: sq, curve: 1.2 });
  return d;
};

variants["S8-sfx"] = () => { // pure sound design: no melody, just physics and air
  const d = buf();
  for (const e of ev.place) {
    if (e.i === T - 1) { kick(d, { at: t(e.f), amp: 0.6, f0: 70, f1: 30, dur: 1.1 }); continue; }
    const bright = 900 + 2200 * (1 - tileR[e.i] / 20);
    noiseSweep(d, { at: t(e.f), dur: 0.06, amp: 0.12, from: bright, to: bright * 0.5, panv: tilePan(e.i), shape: (u) => 1 - u });
    tone(d, { at: t(e.f), freq: 90 + 60 * (1 - tileR[e.i] / 20), dur: 0.1, amp: 0.07, curve: 6 });
  }
  drone(d, { from: 1, to: endT, freqs: [41.2, 41.5], amp: 0.09, lfo: 0.5, riseIn: 4 }); // heartbeat-ish sub
  noiseSweep(d, { at: pauseT, dur: summitT - pauseT, amp: 0.12, from: 150, to: 3500, shape: (u) => u * u });
  noiseSweep(d, { at: rotT, dur: landT - rotT, amp: 0.05, from: 500, to: 900, shape: (u) => 0.6 + 0.4 * Math.sin(2 * Math.PI * 1.5 * u) }); // air as the camera flies
  noiseSweep(d, { at: diveT - 0.3, dur: 2.4, amp: 0.2, from: 4000, to: 200 });
  for (const e of ev.remove) {
    if (e.i === T - 1) continue;
    noiseSweep(d, { at: t(e.f), dur: 0.05, amp: 0.07, from: 2000, to: 500, panv: -tilePan(e.i), shape: (u) => 1 - u });
  }
  kick(d, { at: t(summitGoneF), amp: 0.5, f0: 55, f1: 26, dur: 1.4 });
  echoVerb(d, 0.15, 0.4);
  return d;
};

variants["S9-echoes"] = () => { // every dying tile replays the exact note of its birth
  const d = buf();
  const noteOf = (i) => scaleHz(degOfTile(i, 12), majPent, 165);
  for (const e of ev.place) {
    if (e.i === T - 1) { tone(d, { at: t(e.f), freq: 55, dur: 3, amp: 0.4, partials: [[1, 1], [2, 0.4]], curve: 2.5 }); continue; }
    pluck(d, { at: t(e.f), freq: noteOf(e.i), amp: 0.2, panv: tilePan(e.i) });
  }
  drone(d, { from: rotT, to: landT + 1, freqs: [55, 55.4, 82.5], amp: 0.05 });
  for (const e of ev.remove) { // the same song, an octave down, dressed in shadow
    if (e.i === T - 1) { tone(d, { at: t(e.f), freq: 27.5, dur: 3, amp: 0.35, partials: [[1, 1], [2, 0.5], [3, 0.2]], curve: 2 }); continue; }
    tone(d, { at: t(e.f), freq: noteOf(e.i) / 2, dur: 0.7, amp: 0.1, panv: -tilePan(e.i), partials: [[1, 1], [2, 0.15]], attack: 0.03, curve: 3.5 });
  }
  echoVerb(d, 0.24, 0.5);
  return d;
};

variants["S10-hybrid"] = () => { // the keeper candidate: cinematic bed + plucks + the pi digits
  const d = buf();
  drone(d, { from: 0, to: summitT, freqs: [110, 110.5, 164.8], amp: 0.05, lfo: 0.07, riseIn: 5 });
  for (const e of ev.place) {
    if (e.i === T - 1) { kick(d, { at: t(e.f), amp: 0.5, f0: 80, f1: 33, dur: 1 }); tone(d, { at: t(e.f), freq: 55, dur: 3, amp: 0.3, partials: [[1, 1], [2, 0.3]], curve: 2.2 }); continue; }
    pluck(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 12), majPent, 165), amp: 0.18, panv: tilePan(e.i) });
  }
  noiseSweep(d, { at: pauseT, dur: summitT - pauseT, amp: 0.09, from: 200, to: 2500, shape: (u) => u * u });
  drone(d, { from: summitT, to: landT + 1, freqs: [55, 55.3, 82.4, 110.6], amp: 0.09, lfo: 0.05, riseIn: 1.5 });
  noiseSweep(d, { at: diveT - 0.4, dur: 2.4, amp: 0.13, from: 3000, to: 250 });
  const digits = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5, 8, 9, 7, 9, 3];
  const step = (endT - (diveT + 0.8)) / digits.length;
  digits.forEach((dig, qq) => tone(d, { at: diveT + 0.8 + qq * step, freq: scaleHz(dig, major, 262), dur: step * 1.5, amp: 0.16, partials: [[1, 1], [3, 0.1]], attack: 0.02, curve: 2.5, panv: (qq % 2) * 0.5 - 0.25 }));
  for (const e of ev.remove) {
    if (e.i === T - 1) continue;
    if (e.i % 4 === 0) tone(d, { at: t(e.f), freq: scaleHz(degOfTile(e.i, 12) - 2, minPent, 110), dur: 0.5, amp: 0.05, panv: -tilePan(e.i), curve: 4 });
  }
  tone(d, { at: t(summitGoneF), freq: 55, dur: 2.8, amp: 0.3, partials: [[1, 1], [2, 0.3]], curve: 2 });
  echoVerb(d, 0.26, 0.5);
  return d;
};

// ---------- render, mux, spectrograms ----------
for (const [name, make] of Object.entries(variants)) {
  const d = make();
  fadeEdges(d);
  const peak = writeWav(`${HERE}/${name}.wav`, d);
  execSync(`ffmpeg -y -loglevel error -i "${OUT}/E21-pi-loop-land.mp4" -i "${HERE}/${name}.wav" -c:v copy -c:a aac -b:a 160k -shortest "${OUT}/E21-${name}.mp4"`);
  execSync(`ffmpeg -y -loglevel error -i "${HERE}/${name}.wav" -lavfi "showspectrumpic=s=900x260:legend=0" "${HERE}/spec-${name}.png"`);
  console.log(name, "done (peak " + peak.toFixed(2) + ")");
}
console.log("ALL SOUND VARIANTS DONE");
