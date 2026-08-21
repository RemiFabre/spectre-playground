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

// ---------- composed-melody iterations on the S4 family (E22, faststart) ----------
const variants = {};
const B = 60 / 126;
const BAR = 4 * B;
const beatAt = (tt) => Math.ceil(tt / B) * B;
const q16 = (tt) => Math.round(tt / (B / 4)) * (B / 4);
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Am - F - G - E(major) loop; the melody is a real theme, not a number gimmick.
const ROOTS = [45, 41, 43, 40]; // A2 F2 G2 E2
const MEL = [ // 5 bars of eighth-note slots (0 = rest), ending resolved on A
  [76, 0, 72, 0, 69, 0, 71, 72],
  [74, 0, 72, 71, 69, 0, 65, 0],
  [71, 0, 74, 0, 79, 0, 76, 74],
  [76, 75, 71, 0, 68, 0, 0, 0],
  [69, 0, 0, 0, 0, 0, 0, 0],
];
const PIANO = [[1, 1], [2, 0.35], [3, 0.18], [4, 0.08]];
function playMelody(d, { from, amp = 0.16, oct = 0, stretch = 1, curve = 2.6, panw = 0.25 }) {
  let lastEnd = from;
  MEL.forEach((bar, bi) => bar.forEach((midi, si) => {
    if (!midi) return;
    const at = from + (bi * 8 + si) * (B / 2) * stretch;
    let len = (B / 2) * stretch;
    for (let k = si + 1; k < 8 && !bar[k]; k++) len += (B / 2) * stretch; // rests extend the note
    if (bi === MEL.length - 1) len = 2.2; // the final A rings out
    tone(d, { at, freq: hz(midi + 12 * oct), dur: len * 1.35, amp, partials: PIANO, attack: 0.006, curve, panv: Math.sin(bi + si) * panw });
    tone(d, { at: at + 0.006, freq: hz(midi + 12 * oct) * 1.002, dur: len * 1.35, amp: amp * 0.4, partials: PIANO, attack: 0.006, curve });
    lastEnd = at + len;
  }));
  return lastEnd;
}
function buildSection(d) { // the S4 opening, unchanged
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
function grooveChords(d, { from, to, kickAmp = 0.45, hats = true }) { // bass follows Am F G E
  const start = beatAt(from);
  for (let bt = 0; start + bt * B < to; bt++) {
    const at = start + bt * B;
    kick(d, { at, amp: kickAmp });
    if (hats) hat(d, { at: at + B / 2, amp: 0.09, panv: (bt % 2) * 0.6 - 0.3 });
    if (bt % 2 === 0) {
      const root = ROOTS[Math.floor(bt / 4) % 4];
      tone(d, { at, freq: hz(root - 12), dur: B * 0.9, amp: 0.2, partials: [[1, 1], [2, 0.5], [3, 0.3]], curve: 1.2 });
    }
  }
}
function removalTicks(d, { until = endT, amp = 0.05 }) {
  for (const e of ev.remove) {
    if (e.i === T - 1 || t(e.f) > until) continue;
    hat(d, { at: q16(t(e.f)), amp, dur: 0.03, panv: -tilePan(e.i) });
  }
}
function outroClean(d) { // resolve, then true silence through the black loop seam
  tone(d, { at: t(summitGoneF), freq: hz(45 - 12), dur: 1.1, amp: 0.22, partials: [[1, 1], [2, 0.3]], attack: 0.01, curve: 3.5 });
  tone(d, { at: t(summitGoneF), freq: hz(69 - 24), dur: 1.1, amp: 0.12, partials: PIANO, curve: 3.5 });
}
const FADE_OUT_AT = DUR - 0.6; // everything gone well before the video ends

variants["S4e-lament"] = () => { // continuous groove; the theme sings the second half
  const d = buf();
  buildSection(d);
  grooveChords(d, { from: summitT + B, to: t(summitGoneF) - 0.1 });
  playMelody(d, { from: beatAt(diveT + 0.4), amp: 0.17 });
  removalTicks(d, {});
  outroClean(d);
  echoVerb(d, 0.16, 0.4);
  return d;
};

variants["S4f-acid-minor"] = () => { // acid arp walking Am F G E, theme floating above
  const d = buf();
  buildSection(d);
  grooveChords(d, { from: summitT + B, to: t(summitGoneF) - 0.1, hats: false });
  const start = beatAt(diveT);
  const cell = [0, 12, 7, 12, 3, 12, 7, 10];
  for (let s16 = 0; start + s16 * (B / 4) < t(summitGoneF) - 0.4; s16++) {
    const at = start + s16 * (B / 4);
    const root = ROOTS[Math.floor(s16 / 16) % 4];
    const accent = s16 % 4 === 0;
    tone(d, { at, freq: hz(root + cell[s16 % 8]), dur: B / 4 * 1.3, amp: accent ? 0.12 : 0.075, partials: accent ? [[1, 1], [2, 0.7], [3, 0.5], [4, 0.3]] : [[1, 1], [2, 0.4]], attack: 0.003, curve: 3, drift: accent ? 0.12 : 0 });
  }
  playMelody(d, { from: beatAt(diveT + 0.4) + BAR, amp: 0.15, oct: 1, panw: 0.4 });
  removalTicks(d, { amp: 0.04 });
  outroClean(d);
  return d;
};

variants["S4g-song"] = () => { // most song-like: the theme is teased in the build, stated in full after
  const d = buf();
  buildSection(d);
  // intro tease: sparse high piano over the kicks, quarter-note skeleton of the theme
  MEL.forEach((bar, bi) => [0, 4].forEach((si) => {
    if (!bar[si]) return;
    const at = 2 * BAR + (bi * 8 + si) * (B / 2);
    if (at < pauseT - 0.5) tone(d, { at, freq: hz(bar[si] + 12), dur: 0.9, amp: 0.08, partials: PIANO, curve: 3, panv: 0.3 });
  }));
  grooveChords(d, { from: summitT + B, to: t(summitGoneF) - 0.1 });
  playMelody(d, { from: beatAt(diveT + 0.4), amp: 0.18 });
  // countermelody echo an octave down on the last two bars
  MEL.slice(2).forEach((bar, bi) => bar.forEach((midi, si) => {
    if (!midi) return;
    const at = beatAt(diveT + 0.4) + ((bi + 2) * 8 + si) * (B / 2) + B / 4;
    tone(d, { at, freq: hz(midi - 12), dur: 0.5, amp: 0.06, partials: PIANO, curve: 3.5, panv: -0.3 });
  }));
  removalTicks(d, {});
  outroClean(d);
  echoVerb(d, 0.2, 0.45);
  return d;
};

variants["S4h-darker"] = () => { // half-time L-theme mood: slow heavy kicks, stretched theme
  const d = buf();
  buildSection(d);
  const start = beatAt(diveT);
  for (let bt = 0; start + bt * 2 * B < t(summitGoneF) - 0.3; bt++) {
    const at = start + bt * 2 * B;
    kick(d, { at, amp: 0.45, f0: 90, f1: 34, dur: 0.5 });
    const root = ROOTS[Math.floor(bt / 2) % 4];
    tone(d, { at, freq: hz(root - 12), dur: 2 * B * 0.95, amp: 0.16, partials: [[1, 1], [2, 0.4]], curve: 0.9 });
  }
  grooveChords(d, { from: summitT + B, to: diveT, kickAmp: 0.45 });
  playMelody(d, { from: start + B, amp: 0.17, stretch: 1.6, curve: 2.2 });
  removalTicks(d, { amp: 0.04 });
  outroClean(d);
  echoVerb(d, 0.24, 0.5);
  return d;
};

for (const [name, make] of Object.entries(variants)) {
  const d = make();
  fadeEdges(d, 0.05, FADE_OUT_AT, 0.45);
  // verify the loop seam is silent
  let tail = 0;
  const s0 = Math.floor((DUR - 0.45) * SR);
  for (let c = 0; c < 2; c++) for (let s = s0; s < Math.floor(DUR * SR); s++) tail = Math.max(tail, Math.abs(d[c][s]));
  const peak = writeWav(`${HERE}/${name}.wav`, d);
  execSync(`ffmpeg -y -loglevel error -i "${OUT}/E22-pi-loop-gold.mp4" -i "${HERE}/${name}.wav" -c:v copy -c:a aac -b:a 160k -af apad -t ${DUR.toFixed(3)} -movflags +faststart "${OUT}/E22-${name}.mp4"`);
  console.log(name, "done (peak " + peak.toFixed(2) + ", tail " + tail.toFixed(4) + ")");
}
console.log("SOUND V3 DONE");
