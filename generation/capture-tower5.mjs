import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import os from "os";

const OUT = os.homedir() + "/Desktop/spectre-gifs";
const NAME = "E15-pi-loop";
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
const cam = (t, o, d) => page.evaluate(([t, o, d]) => window.__setCam(t, o, d), [t, o, d]);
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
for (let j = 0; j < 26; j++) await snap(); // the pause on the summit hole
await win(0, T);                           // the black piece, silently
for (let j = 0; j < 8; j++) await snap();

// act 2: tilt and orbit reveal the mountain
for (let j = 0; j <= 54; j++) {
  const u = smooth(j / 54);
  await cam(55 * u, 25 * u, D0 - 16 * u);
  await snap();
}
for (let j = 1; j <= 85; j++) {
  const u = j / 85;
  const orbit = 25 + 180 * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
  await cam(55, orbit, D0 - 16);
  await snap();
}

// act 3: the camera dives below; the pi world appears; the rim starts to dissolve
let m = 0; // tiles 0..m-1 are gone (same order the build used: outside in)
for (let j = 0; j <= 54; j++) {
  const u = smooth(j / 54);
  await cam(55 + 125 * u, 205 + 65 * u, (D0 - 16) + 16 * u);
  if (j > 15) { m = Math.min(48, m + 2); await win(m, T); }
  await snap();
}
// act 4: settled straight below, pi in view, the dissolve runs inward
while (m < T - 8) {
  m = Math.min(T - 8, m + 3);
  await win(m, T);
  await snap();
}
while (m < T - 1) { // the last winding goes slowly
  m += 1;
  await win(m, T);
  for (let j = 0; j < 3; j++) await snap();
}
for (let j = 0; j < 7; j++) await snap(); // the black piece alone, one last beat
await win(T, T);
for (let j = 0; j < 9; j++) await snap(); // half a second of black, then the loop
await browser.close();
console.log(NAME + ": " + f + " frames (" + (f / 18).toFixed(1) + "s)");

execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 21 "${OUT}/${NAME}.mp4"`);
execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -vf "fps=14,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" "${OUT}/${NAME}.gif"`);
rmSync(dir, { recursive: true, force: true });
console.log("done");
