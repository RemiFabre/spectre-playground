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
const hash01 = (x, y) => { const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return h - Math.floor(h); };
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360}, ${s}%, ${l}%)`;

// color(tile geometry) -> fill string or {hue} override; last tile handled separately
const COLORINGS = {
  "E5-radial-bold": {
    tile: ({ d }) => ({ hue: (195 + ((R - d) / R) * 320) % 360 }),
    last: "hsl(46, 95%, 60%)", // gold
  },
  "E6-eye-cat": {
    tile: ({ x, y, d, ang }) => {
      if ((x / 2.4) ** 2 + (y / 8) ** 2 <= 1) return { fill: hsl(232, 22, 8) }; // vertical slit pupil
      if (d <= 14) { // golden iris with radial streaks
        const streak = 7 * Math.sin(ang * 9) + 6 * hash01(x, y);
        return { fill: hsl(38 + 6 * Math.sin(ang * 3), 88, 38 + 16 * (d / 14) + streak) };
      }
      return { fill: hsl(28, 55, 20 + 6 * hash01(x, y)) }; // dark amber rim
    },
    last: "hsl(50, 30%, 94%)", // the glint: the eye lights up
  },
  "E7-eye-goat": {
    tile: ({ x, y, d, ang }) => {
      if ((x / 7.4) ** 4 + (y / 2.6) ** 4 <= 1) return { fill: hsl(232, 22, 8) }; // horizontal bar pupil
      if (d <= 14) {
        const fleck = 8 * hash01(y, x) + 4 * Math.sin(ang * 7);
        return { fill: hsl(42 + 5 * Math.sin(ang * 2), 62, 55 + 10 * (d / 14) + fleck - 6) }; // pale amber iris
      }
      return { fill: hsl(20, 45, 24 + 6 * hash01(x, y)) }; // brown rim
    },
    last: "hsl(50, 30%, 94%)",
  },
  "E8-eye-hal": {
    tile: ({ d }) => {
      if (d <= 2.6) return { fill: hsl(50, 100, 60) };                       // yellow core
      if (d <= 7.5) return { fill: hsl(8, 95, 42 + 8 * (1 - d / 7.5)) };     // bright red glow
      if (d <= 14) return { fill: hsl(0, 85, 26 + 6 * (1 - d / 14)) };       // deep red
      return { fill: hsl(0, 60, 13) };                                       // near-black red rim
    },
    last: "hsl(52, 100%, 86%)", // white-hot center
  },
  "E9-spiral-rainbow": {
    tile: (_, i, T) => ({ hue: ((i / T) * 720) % 360 }), // rainbow winding along the arm, two full cycles
    last: "hsl(45, 25%, 96%)",
  },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const name of ["E6-eye-cat", "E7-eye-goat"]) {
  const coloring = COLORINGS[name];
  const dir = `${OUT}/frames-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("PAGEERROR", name, String(e)));
  await page.goto("http://localhost:8377/index.html");
  await page.waitForTimeout(700);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(700);
  await page.addStyleTag({ content: "#bar,#hint{display:none!important} #board{cursor:none}" });

  // E's identity: same patch region, continuous spiral, center last
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
  const cents = plan.map((t) => SC.tileCentroid(t));
  const tiles = plan.map((t, i) => {
    const out = { k: t.k, x: t.x, y: t.y };
    if (i === T - 1 && coloring.last) { out.fill = coloring.last; return out; }
    const [cx, cy] = cents[i];
    const geom = { x: cx, y: cy, d: t.d, ang: Math.atan2(cy, cx) };
    Object.assign(out, coloring.tile(geom, i, T));
    return out;
  });
  console.log(name + ": " + T + " tiles");

  // intro zoom-out: deterministic, starts immediately, settles at the wide view by 40%
  const sFull = 900 / (2 * (R + 2.2));
  const sIn = 900 / (2 * 14);
  const smooth = (u) => u * u * (3 - 2 * u);
  async function setZoom(progress) {
    const u = smooth(Math.min(1, progress / 0.4));
    const s = sIn * Math.pow(sFull / sIn, u);
    await page.evaluate((s) => {
      const v = window.__spectre.state.view;
      v.scale = s; v.ox = 450; v.oy = 450;
    }, s);
  }

  let f = 0;
  const pad = (n) => String(n).padStart(5, "0");
  const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });
  const shotsAfter = (i) => {
    const p = i / T;
    if (p < 0.45) return i % 2 === 0 ? 1 : 0;
    if (p < 0.70) return 1;
    if (p < 0.85) return 2;
    if (p < 0.93) return 3;
    return 5; // last winding crawl
  };

  await setZoom(0);
  for (let j = 0; j < 5; j++) await snap();

  for (let i = 0; i < T; i++) {
    const isLast = i === T - 1;
    if (isLast) {
      for (let j = 0; j < 26; j++) { await snap(); await page.waitForTimeout(35); }
    }
    await page.evaluate((t) => window.__spectre.commitTile(t), tiles[i]);
    const n = isLast ? 6 : shotsAfter(i);
    for (let s = 0; s < n; s++) {
      if (i / T < 0.45) await setZoom(i / T);
      await snap();
      if (n > 1) await page.waitForTimeout(40);
    }
  }
  for (let j = 0; j < 58; j++) { await snap(); await page.waitForTimeout(40); }
  await page.close();

  execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "${OUT}/${name}.mp4"`);
  execSync(`ffmpeg -y -loglevel error -framerate 18 -i "${dir}/f%05d.png" -vf "fps=15,scale=560:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" "${OUT}/${name}.gif"`);
  rmSync(dir, { recursive: true, force: true });
  console.log("  -> " + name + " done, " + f + " frames (" + (f / 18).toFixed(1) + "s)");
}

await browser.close();
console.log("ROUND 4 DONE -> " + OUT);
