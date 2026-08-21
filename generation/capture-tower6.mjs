import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import os from "os";

const OUT = os.homedir() + "/Desktop/spectre-gifs";
const NAME = "E22-pi-loop-gold";
const dir = `${OUT}/frames-${NAME}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const pad = (n) => String(n).padStart(5, "0");

const T = 151;
const FOV_HALF = (12.5 * Math.PI) / 180;
const D0 = 22.2 / Math.tan(FOV_HALF);
const DIN = 14 / Math.tan(FOV_HALF);
const smooth = (u) => u * u * (3 - 2 * u);
const easeOutBack = (u) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; };
const distAt = (p) => DIN * Math.pow(D0 / DIN, easeOutBack(Math.min(1, p / 0.32)));
const shotsAfter = (i) => {
  const p = i / T;
  if (p < 0.45) return i % 2 === 0 ? 1 : 0;
  if (p < 0.70) return 1;
  if (p < 0.85) return 2;
  if (p < 0.93) return 3;
  return 5;
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto("http://localhost:8378/capture3d.html?board=tower-board-e15.json");
await page.waitForFunction("window.__ready === true", { timeout: 30000 });

let f = 0;
const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });
const cam = (t, o, d, fov) => page.evaluate(([t, o, d, fov]) => window.__setCam(t, o, d, fov), [t, o, d, fov || 25]);
const win = (a, b) => page.evaluate(([a, b]) => window.__window(a, b), [a, b]);

// act 1: the sunset mountain builds itself, seen from straight above
await win(0, 0);
await cam(0, 0, DIN);
for (let j = 0; j < 4; j++) await snap();
for (let i = 0; i < T - 1; i++) {
  await win(0, i + 1);
  const n = shotsAfter(i);
  for (let s = 0; s < n; s++) {
    if (i / T < 0.4) await cam(0, 0, distAt(i / T));
    await snap();
  }
}
for (let j = 0; j < 26; j++) await snap();
await win(0, T);
for (let j = 0; j < 8; j++) await snap();

// acts 2+3: ONE continuous orbit. Angular speed ramps up once and never stops or
// reverses; tilt rides along: 0 -> 55 (reveal), hold, 55 -> 180 (the dive below).
// Dissolve runs radially inward at a steady rate once the underside is in view,
// easing out gently near the summit.
const ROT = 200;                 // frames of camera motion
const RAMP = 25, LAND = 32;
let speeds = [];
for (let j = 0; j < ROT; j++) {
  const up = Math.min(1, j / RAMP);
  const down = j > ROT - LAND ? Math.max(0, (ROT - j) / LAND) : 1;
  speeds.push(Math.min(up, down * down * (3 - 2 * down)));
}
const total = speeds.reduce((a, b) => a + b, 0);
const VMAX = 270 / total;        // lands exactly at orbit 270, right in front of pi
let orbit = 0;
let mFloat = 0, m = 0;
const DISSOLVE_START = 120;      // tilt has passed ~110 deg: the underside is in view
const DISSOLVE_END_HOLD = 85;    // extra fixed-camera frames to finish the dissolve
const dissolveFrames = (ROT - DISSOLVE_START) + DISSOLVE_END_HOLD;
// gentle while the camera is still swinging under (only the outer windings go),
// steady once settled with pi fully in view, easing out near the summit
function dissolveStep(k) {
  const approach = ROT - DISSOLVE_START; // frames before the camera settles below
  let rate;
  if (k < approach) rate = 48 / approach;
  else {
    const k2 = k - approach, len = DISSOLVE_END_HOLD;
    const left = len - k2;
    const base = (T - 1 - 48) / (len * 0.9);
    rate = left < len * 0.3 ? base * Math.max(0.25, left / (len * 0.3)) : base;
  }
  mFloat = Math.min(T - 1, mFloat + rate);
  const next = Math.floor(mFloat);
  if (next !== m) { m = next; return true; }
  return false;
}
for (let j = 0; j < ROT; j++) {
  orbit += VMAX * speeds[j];
  let tilt, d;
  if (j < 60) { const u = smooth(j / 60); tilt = 55 * u; d = D0 - 16 * u; }
  else if (j < 110) { tilt = 55; d = D0 - 16; }
  else { const u = smooth((j - 110) / (ROT - 110)); tilt = 55 + 125 * Math.min(1, u); d = (D0 - 16) + 16 * Math.min(1, u); }
  if (j >= DISSOLVE_START && dissolveStep(j - DISSOLVE_START)) await win(m, T);
  await cam(tilt, orbit, d);
  await snap();
}
// act 4: landed in front of pi; the camera does not move again.
// The dissolve finishes on its own.
for (let k = ROT - DISSOLVE_START; m < T - 1 && k < dissolveFrames + 60; k++) {
  if (dissolveStep(k)) await win(m, T);
  await snap();
}
for (let j = 0; j < 7; j++) await snap(); // the black piece alone
await win(T, T);
for (let j = 0; j < 9; j++) await snap(); // half a second of black, then the loop
await browser.close();
console.log(NAME + ": " + f + " frames (" + (f / 18).toFixed(1) + "s)");

execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 21 "${OUT}/${NAME}.mp4"`);
execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -vf "fps=14,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" "${OUT}/${NAME}.gif"`);
rmSync(dir, { recursive: true, force: true });
console.log("done");
