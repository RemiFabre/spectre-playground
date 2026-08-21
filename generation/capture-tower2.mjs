import { chromium } from "playwright-core";
import { mkdirSync, rmSync, writeFileSync, readdirSync, copyFileSync } from "fs";
import { execSync } from "child_process";
import { createRequire } from "module";
import os from "os";

const require = createRequire(import.meta.url);
const SC = require("./spectre-core.js");
const OUT = os.homedir() + "/Desktop/spectre-gifs";
const HERE = ".";
const R = 20, BAND = 3.4;
const hash01 = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); };
const pad = (n) => String(n).padStart(5, "0");

const browser = await chromium.launch({ channel: "chrome", headless: true });

// ---- phase A: 2D sunset build with a silent black final piece (rendered once) ----
const dirA = `${HERE}/frames-phaseA`;
rmSync(dirA, { recursive: true, force: true });
mkdirSync(dirA, { recursive: true });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
await page.goto("http://localhost:8377/index.html");
await page.waitForTimeout(700);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(700);
await page.addStyleTag({ content: "#bar,#hint,#mark{display:none!important} #board{cursor:none}" });

const plan = await page.evaluate(([R, BAND]) => {
  const W = window.__spectre, S = window.SpectreCore;
  const st = W.state;
  st.tiles.length = 0; st.undo.length = 0; st.embeddings = null;
  st.mode = "guided"; st.palette = "color";
  const P = W.PATCH, I = W.INDEX;
  const cents = P.map((t) => S.tileCentroid(t));
  let cx = 0, cy = 0;
  for (const c of cents) { cx += c[0]; cy += c[1]; }
  cx /= P.length; cy /= P.length;
  let c0 = -1, best = 1e9;
  for (let i = 0; i < P.length; i++) {
    if (!I.interior[i]) continue;
    const d = Math.hypot(cents[i][0] - cx, cents[i][1] - cy);
    if (d < best) { best = d; c0 = i; }
  }
  const O = cents[c0];
  const picks = [];
  for (let i = 0; i < P.length; i++) {
    if (!I.interior[i]) continue;
    const dx = cents[i][0] - O[0], dy = cents[i][1] - O[1];
    const d = Math.hypot(dx, dy);
    if (d <= R) picks.push({ i, d, ang: Math.atan2(dy, dx) });
  }
  picks.sort((a, b) => a.d - b.d);
  const center = picks.shift();
  for (const p of picks) p.key = p.ang + ((R - p.d) / BAND) * 2 * Math.PI;
  const order = picks.slice().sort((a, b) => a.key - b.key);
  order.push(center);
  return order.map((p) => ({ k: P[p.i].k, x: P[p.i].x - O[0], y: P[p.i].y - O[1], d: p.d }));
}, [R, BAND]);

const T = plan.length;
const tiles = plan.map((t, i) => {
  const out = { k: t.k, x: t.x, y: t.y, d: t.d };
  if (i === T - 1) { out.fill = "#0a0c12"; return out; }
  const hue = ((45 - ((R - t.d) / R) * 70) % 360 + 360) % 360;
  out.fill = "hsl(" + Math.round(hue) + ", 75%, " + Math.round(61 - 12 * ((R - t.d) / R) + hash01(t.x, t.y) * 5) + "%)";
  return out;
});
console.log("phase A (sunset): " + T + " tiles");

const sFull = 900 / (2 * (R + 2.2));
const sIn = 900 / (2 * 14);
const smooth = (u) => u * u * (3 - 2 * u);
const easeOutBack = (u) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2; };
async function setZoom(progress) {
  const u = Math.min(1, progress / 0.32);
  const s = sIn * Math.pow(sFull / sIn, easeOutBack(u));
  await page.evaluate((s) => {
    const v = window.__spectre.state.view;
    v.scale = s; v.ox = 450; v.oy = 450;
  }, s);
}
let f = 0;
const snapA = () => page.screenshot({ path: `${dirA}/f${pad(f++)}.png` });
const shotsAfter = (i) => {
  const p = i / T;
  if (p < 0.45) return i % 2 === 0 ? 1 : 0;
  if (p < 0.70) return 1;
  if (p < 0.85) return 2;
  if (p < 0.93) return 3;
  return 5;
};
await setZoom(0);
for (let j = 0; j < 4; j++) await snapA();
for (let i = 0; i < T; i++) {
  const isLast = i === T - 1;
  if (isLast) {
    for (let j = 0; j < 26; j++) { await snapA(); await page.waitForTimeout(35); }
    // the black piece arrives silently: no pulse, no pop, as if it was always there
    await page.evaluate((t) => {
      window.__spectre.commitTile(t, { quiet: true });
      window.__spectre.state.tiles.at(-1).born = 0;
    }, tiles[i]);
    for (let j = 0; j < 6; j++) { await snapA(); await page.waitForTimeout(40); }
    continue;
  }
  await page.evaluate((t) => window.__spectre.commitTile(t), tiles[i]);
  const n = shotsAfter(i);
  for (let s = 0; s < n; s++) {
    if (i / T < 0.4) await setZoom(i / T);
    await snapA();
    if (n > 1) await page.waitForTimeout(40);
  }
}
for (let j = 0; j < 12; j++) { await snapA(); await page.waitForTimeout(40); }
await page.close();
const framesA = f;
console.log("phase A done: " + framesA + " frames");

// ---- boards with heights ----
function writeBoard(name, heightFn) {
  writeFileSync(`${HERE}/${name}.json`, JSON.stringify({
    board: { t: tiles.map((t, i) => [t.k, Math.round(t.x * 1000), Math.round(t.y * 1000), t.fill, heightFn(t, i === T - 1)]) },
  }));
}
writeBoard("tower-board-e11", (t, last) => (last ? 6 : 0.35));
writeBoard("tower-board-e12", (t, last) => (last ? 7 : 0.5 + Math.floor((R - t.d) / BAND) * 0.75));

// ---- phase B per take ----
const D0 = 22.2 / Math.tan((12.5 * Math.PI) / 180); // matches the 2D framing at fov 25
for (const take of [
  { name: "E11-monolith-sunset", boardFile: "tower-board-e11.json" },
  { name: "E12-mountain-sunset", boardFile: "tower-board-e12.json" },
]) {
  const dir = `${OUT}/frames-${take.name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const file of readdirSync(dirA)) copyFileSync(`${dirA}/${file}`, `${dir}/${file}`);
  let g = framesA;
  const page3 = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  page3.on("pageerror", (e) => console.log("PAGEERROR3", take.name, String(e)));
  await page3.goto("http://localhost:8378/capture3d.html?board=" + take.boardFile);
  await page3.waitForFunction("window.__ready === true", { timeout: 30000 });
  for (let j = 0; j <= 54; j++) {
    const u = smooth(j / 54);
    await page3.evaluate(([t, o, d]) => window.__setCam(t, o, d), [55 * u, 25 * u, D0 - 16 * u]);
    await page3.screenshot({ path: `${dir}/f${pad(g++)}.png` });
  }
  for (let j = 1; j <= 85; j++) {
    const u = j / 85;
    const orbit = 25 + 180 * (u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u));
    await page3.evaluate(([t, o, d]) => window.__setCam(t, o, d), [55, orbit, D0 - 16]);
    await page3.screenshot({ path: `${dir}/f${pad(g++)}.png` });
  }
  for (let j = 0; j < 12; j++) await page3.screenshot({ path: `${dir}/f${pad(g++)}.png` });
  await page3.close();
  execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 21 "${OUT}/${take.name}.mp4"`);
  execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -vf "fps=14,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5" "${OUT}/${take.name}.gif"`);
  rmSync(dir, { recursive: true, force: true });
  console.log(take.name + " done: " + g + " frames (" + (g / 18).toFixed(1) + "s)");
}
rmSync(dirA, { recursive: true, force: true });
await browser.close();
console.log("ROUND 7 DONE");
