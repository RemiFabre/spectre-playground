import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import { createRequire } from "module";
import os from "os";

const require = createRequire(import.meta.url);
const SC = require("./spectre-core.js");

const OUT = os.homedir() + "/Desktop/spectre-gifs";
mkdirSync(OUT, { recursive: true });

const R = 20, BAND = 3.4;
const TAKES = [
  { name: "E1-slower", colors: "mosaic", last: null, camera: false },
  { name: "E2-ringcolors", colors: "bands", last: "hsl(45, 25%, 96%)", camera: false },
  { name: "E3-radialcolors", colors: "radial", last: "hsl(46, 95%, 60%)", camera: false },
  { name: "E4-rings-softcam", colors: "bands", last: "hsl(45, 25%, 96%)", camera: "soft" },
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

  // E's identity: same patch region, same continuous-spiral order, center last
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
    st.view.scale = 900 / (2 * (R + 2.2));
    st.view.ox = 450; st.view.oy = 450;
    return order.map((p) => ({ k: P[p.i].k, x: P[p.i].x - O[0], y: P[p.i].y - O[1], d: p.d }));
  }, [R, BAND]);

  const T = plan.length;
  const cents = plan.map((t) => SC.tileCentroid(t));
  const centerC = cents[T - 1];
  console.log(take.name + ": " + T + " tiles");

  // colors
  const tiles = plan.map((t, i) => {
    const out = { k: t.k, x: t.x, y: t.y };
    if (i === T - 1 && take.last) { out.fill = take.last; return out; }
    if (take.colors === "bands") {
      const band = Math.floor((R - t.d) / BAND);
      out.hue = (210 + band * 55) % 360;   // blue rim stepping inward through the wheel
    } else if (take.colors === "radial") {
      out.hue = (195 + ((R - t.d) / R) * 165) % 360; // smooth teal rim -> warm center
    }
    return out;
  });

  // soft camera: fixed through the build, gentle push on the finale, ease back out
  const sFull = 900 / (2 * (R + 2.2));
  const sMid = 900 / (2 * 13);
  const cam = { x: 0, y: 0, s: sFull };
  async function applyCam(tx, ty, ts, e) {
    if (!take.camera) return;
    cam.x += (tx - cam.x) * e;
    cam.y += (ty - cam.y) * e;
    cam.s *= Math.pow(ts / cam.s, e);
    await page.evaluate(([s, x, y]) => {
      const v = window.__spectre.state.view;
      v.scale = s; v.ox = 450 - x * s; v.oy = 450 - y * s;
    }, [cam.s, cam.x, cam.y]);
  }

  let f = 0;
  const pad = (n) => String(n).padStart(5, "0");
  const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });
  const shotsAfter = (i) => {
    const p = i / T;
    if (p < 0.45) return i % 2 === 0 ? 1 : 0; // fast open: two tiles per frame
    if (p < 0.70) return 1;
    if (p < 0.85) return 2;
    if (p < 0.93) return 3;
    return 5;                                  // last winding: let the brain try to solve it
  };

  for (let j = 0; j < 5; j++) await snap();

  for (let i = 0; i < T; i++) {
    const isLast = i === T - 1;
    if (isLast) {
      // the hole: pause (soft camera glides in a little here)
      for (let j = 0; j < 26; j++) {
        await applyCam(centerC[0] * 0.6, centerC[1] * 0.6, sMid, 0.07);
        await snap();
        await page.waitForTimeout(35);
      }
    }
    await page.evaluate((t) => window.__spectre.commitTile(t), tiles[i]);
    const n = isLast ? 6 : shotsAfter(i);
    for (let s = 0; s < n; s++) {
      if (isLast) await applyCam(centerC[0] * 0.6, centerC[1] * 0.6, sMid, 0.07);
      await snap();
      if (n > 1) await page.waitForTimeout(40);
    }
  }
  // hold on the finished disc; soft camera eases back to the wide view
  for (let j = 0; j < 58; j++) {
    await applyCam(0, 0, sFull, 0.06);
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
console.log("ROUND 3 DONE -> " + OUT);
