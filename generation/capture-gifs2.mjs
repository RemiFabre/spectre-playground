import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import { createRequire } from "module";
import os from "os";

const require = createRequire(import.meta.url);
const SC = require("./spectre-core.js");

const OUT = os.homedir() + "/Desktop/spectre-gifs";
mkdirSync(OUT, { recursive: true });

const TAKES = [
  { name: "E-spiral-flat", R: 20, mode: "spiral", camera: false },
  { name: "F-rings-flat", R: 20, mode: "rings", camera: false },
  { name: "G-spiral-camera", R: 20, mode: "spiral", camera: "normal" },
  { name: "H-spiral-camera-tight", R: 20, mode: "spiral", camera: "tight" },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const take of TAKES) {
  const dir = `${OUT}/frames-${take.name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("PAGEERROR", take.name, String(e)));
  await page.goto("http://localhost:8377/index.html");
  await page.waitForTimeout(700);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(700);
  await page.addStyleTag({ content: "#bar,#hint{display:none!important} #board{cursor:none}" });

  const plan = await page.evaluate(([R, mode]) => {
    const W = window.__spectre, S = window.SpectreCore;
    const st = W.state;
    st.tiles.length = 0; st.undo.length = 0; st.embeddings = null;
    st.mode = "guided"; st.palette = "color"; // base tiles only, no field effects
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
    const BAND = 3.4;
    let order;
    if (mode === "rings") {
      const ring = picks.filter((p) => p.d >= R - 3.6).sort((a, b) => a.ang - b.ang);
      const inner = picks.filter((p) => p.d < R - 3.6)
        .sort((a, b) => Math.floor((R - a.d) / BAND) - Math.floor((R - b.d) / BAND) || a.ang - b.ang);
      order = ring.concat(inner);
    } else {
      for (const p of picks) p.key = p.ang + ((R - p.d) / BAND) * 2 * Math.PI;
      order = picks.slice().sort((a, b) => a.key - b.key);
    }
    order.push(center);
    st.view.scale = 900 / (2 * (R + 2.2));
    st.view.ox = 450; st.view.oy = 450;
    return { tiles: order.map((p) => ({ k: P[p.i].k, x: P[p.i].x - O[0], y: P[p.i].y - O[1] })) };
  }, [take.R, take.mode]);

  const tiles = plan.tiles;
  const cents = tiles.map((t) => SC.tileCentroid(t));
  const T = tiles.length;
  console.log(take.name + ": " + T + " tiles");

  // camera state (world center + scale), eased toward targets
  const sFull = 900 / (2 * (take.R + 2.2));
  const sIn = take.camera === "tight" ? 900 / (2 * 6.5) : 900 / (2 * 9);
  const sClose = take.camera === "tight" ? 900 / (2 * 7) : 900 / (2 * 10);
  const cam = { x: take.camera ? cents[0][0] : 0, y: take.camera ? cents[0][1] : 0, s: take.camera ? sIn : sFull };
  const centerC = cents[T - 1];

  async function applyCam(tx, ty, ts, ease) {
    if (!take.camera) return;
    const e = ease || 0.12;
    cam.x += (tx - cam.x) * e;
    cam.y += (ty - cam.y) * e;
    cam.s *= Math.pow(ts / cam.s, e);
    await page.evaluate(([s, x, y]) => {
      const v = window.__spectre.state.view;
      v.scale = s; v.ox = 450 - x * s; v.oy = 450 - y * s;
    }, [cam.s, cam.x, cam.y]);
  }

  function camTarget(i) {
    const p = i / T;
    if (p < 0.45) {
      // trailing the construction head while zooming out
      const z = sIn * Math.pow(sFull / sIn, p / 0.45);
      const w = Math.min(1, p / 0.35); // drift toward global view
      return [cents[i][0] * (1 - w * 0.7), cents[i][1] * (1 - w * 0.7), z];
    }
    if (i < T - 9) return [0, 0, sFull];
    return [centerC[0], centerC[1], sClose]; // push in for the finale
  }

  let f = 0;
  const pad = (n) => String(n).padStart(5, "0");
  const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });
  const shotsAfter = (i) => {
    const p = i / T;
    if (p < 0.45) return i % 2 === 0 ? 1 : 0; // fast: two tiles per frame
    if (p < 0.75) return 1;
    if (p < 0.92) return 2;                    // slowing down
    return 3;                                  // crawl to the finish
  };

  for (let j = 0; j < 5; j++) { await applyCam(...camTarget(0)); await snap(); }

  for (let i = 0; i < T; i++) {
    const isLast = i === T - 1;
    if (isLast) {
      // the hole: hold, slowly pushing in
      for (let j = 0; j < 24; j++) { await applyCam(...camTarget(i)); await snap(); await page.waitForTimeout(30); }
    }
    await page.evaluate((t) => window.__spectre.commitTile(t), tiles[i]);
    const n = isLast ? 4 : shotsAfter(i);
    for (let s = 0; s < n; s++) {
      await applyCam(...camTarget(i));
      await snap();
      if (n > 1) await page.waitForTimeout(40);
    }
  }
  // hold on the finished disc; camera pulls back out
  for (let j = 0; j < 55; j++) {
    await applyCam(0, 0, sFull, 0.08);
    await snap();
    await page.waitForTimeout(40);
  }
  await page.close();

  execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "${OUT}/${take.name}.mp4"`);
  execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -vf "fps=15,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" "${OUT}/${take.name}.gif"`);
  rmSync(dir, { recursive: true, force: true });
  console.log("  -> " + take.name + " done, " + f + " frames (" + (f / 18).toFixed(1) + "s)");
}

await browser.close();
console.log("ROUND 2 DONE -> " + OUT);
