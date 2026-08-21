import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import os from "os";

const OUT = os.homedir() + "/Desktop/spectre-gifs";
const NAME = "E14-mountain-first";
const dir = `${OUT}/frames-${NAME}`;
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
const pad = (n) => String(n).padStart(5, "0");

const T = 151;
const FOV_HALF = (12.5 * Math.PI) / 180;
const D0 = 22.2 / Math.tan(FOV_HALF);  // wide view, matches the 2D framing
const DIN = 14 / Math.tan(FOV_HALF);   // intro zoom start
const smooth = (u) => u * u * (3 - 2 * u);
const easeOutBack = (u) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; };
const distAt = (progress) => {
  const u = Math.min(1, progress / 0.32);
  return DIN * Math.pow(D0 / DIN, easeOutBack(u));
};
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
await page.goto("http://localhost:8378/capture3d.html?board=tower-board-e14.json");
await page.waitForFunction("window.__ready === true", { timeout: 30000 });

let f = 0;
const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });
const cam = (t, o, d) => page.evaluate(([t, o, d]) => window.__setCam(t, o, d), [t, o, d]);
const reveal = (n) => page.evaluate((n) => window.__reveal(n), n);

// one continuous shot: the black piece is there from the very first frame,
// and the spiral builds around it, closing in on the summit
await reveal(1);
await cam(0, 0, DIN);
for (let j = 0; j < 14; j++) await snap();
for (let i = 1; i < T; i++) {
  const isLast = i === T - 1;
  if (isLast) for (let j = 0; j < 26; j++) await snap(); // the final gap beside the summit
  await reveal(i + 1);
  const n = isLast ? 8 : shotsAfter(i);
  for (let s = 0; s < n; s++) {
    if (i / T < 0.4) await cam(0, 0, distAt(i / T));
    await snap();
  }
}
// ...and the same camera keeps moving: tilt, orbit, hold. No cut anywhere.
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
for (let j = 0; j < 12; j++) await snap();
await browser.close();
console.log(NAME + ": " + f + " frames (" + (f / 18).toFixed(1) + "s)");

execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 21 "${OUT}/${NAME}.mp4"`);
execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -vf "fps=14,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" "${OUT}/${NAME}.gif"`);
rmSync(dir, { recursive: true, force: true });
console.log("done");
