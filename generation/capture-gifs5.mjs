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
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360}, ${Math.round(s)}%, ${Math.round(l)}%)`;

// Each colorer: ({x, y, d, ang, band}) -> fill string. Rim tiles appear first in the
// GIF, so rims stay vivid/light (lesson from the eye takes).
const COLORINGS = {
  "F0-e5-rebound": {
    tile: ({ d, x, y }) => hsl(195 + ((R - d) / R) * 320, 62, 56 + hash01(y, x) * 9),
    last: "hsl(45, 25%, 96%)",
  },
  "F1-ocean": { // analogous teal -> violet, light rim to deeper center; coral accent
    tile: ({ d, x, y }) => hsl(165 + ((R - d) / R) * 90, 60, 63 - 18 * ((R - d) / R) + hash01(x, y) * 6),
    last: "hsl(15, 85%, 62%)",
  },
  "F2-sunset": { // gold rim melting to magenta center; indigo accent
    tile: ({ d, x, y }) => hsl(45 - ((R - d) / R) * 70, 75, 61 - 12 * ((R - d) / R) + hash01(x, y) * 5),
    last: "hsl(245, 55%, 32%)",
  },
  "F3-triadic-steps": { // stepped windings cycling a blue/rose/leaf triad
    tile: ({ band, x, y }) => hsl([210, 335, 95][band % 3], 52, 56 + (band % 2) * 7 + hash01(x, y) * 5),
    last: "hsl(45, 25%, 96%)",
  },
  "F4-ice-steps": { // stepped blues, ice rim to navy heart; amber accent
    tile: ({ band, x, y }) => hsl(212 + (band % 2 ? 14 : -10) + band * 3, 45 + band * 8, 70 - band * 8 + hash01(x, y) * 4),
    last: "hsl(40, 90%, 60%)",
  },
  "F5-pi": { // the letter pi in deep slate on warm cream
    tile: ({ x, y, d }) => {
      const bar = y >= -7.2 && y <= -3.8 && Math.abs(x) <= 8.2;
      const legs = y >= -3.8 && y <= 8.6 && (Math.abs(x + 4.2) <= 1.7 || Math.abs(x - 4.2) <= 1.7);
      if (bar || legs) return hsl(220, 45, 22 + hash01(x, y) * 4);
      return hsl(42, 32, 86 + hash01(x, y) * 5);
    },
    last: "hsl(42, 85%, 55%)", // a small gold keystone
  },
  "F6-slash": { // one deep-teal brush stroke through warm sand
    tile: ({ x, y, d }) => {
      const c = Math.cos(-0.61), s = Math.sin(-0.61); // ~-35 deg line through the center
      const perp = Math.abs(-s * x + c * y);
      const along = Math.abs(c * x + s * y);
      if (perp <= 2.0 && along <= 18) return hsl(190, 70, 36 + hash01(x, y) * 6);
      return hsl(35, 22, 60 + 10 * (d / R) + hash01(x, y) * 4);
    },
    last: "hsl(185, 90%, 62%)", // the stroke completes with a bright touch
  },
  "F7-golden-angle": { // each winding steps the hue by the golden angle; muted pastels
    tile: ({ band, x, y }) => hsl(band * 137.5, 48, 60 + hash01(x, y) * 6),
    last: "hsl(230, 25%, 18%)",
  },
  "F8-mono-well": { // single blue, luminous rim sinking to a dark center; white finish
    tile: ({ d, x, y }) => hsl(215, 55, 74 - ((R - d) / R) * 48 + hash01(x, y) * 4),
    last: "hsl(45, 20%, 97%)",
  },
  "F9-two-tone": { // windings alternate deep teal and warm sand; coral accent
    tile: ({ band, x, y }) => (band % 2
      ? hsl(178, 42, 42 + hash01(x, y) * 6)
      : hsl(40, 48, 76 + hash01(x, y) * 5)),
    last: "hsl(12, 80%, 60%)",
  },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const name of Object.keys(COLORINGS)) {
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

  // E's identity: same patch region, continuous spiral, center last (unchanged)
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
    if (i === T - 1) { out.fill = coloring.last; return out; }
    const [cx, cy] = cents[i];
    out.fill = coloring.tile({ x: cx, y: cy, d: t.d, ang: Math.atan2(cy, cx), band: Math.floor((R - t.d) / BAND) });
    return out;
  });
  console.log(name + ": " + T + " tiles");

  // intro zoom-out with a rebound: faster, overshoots the wide view a touch,
  // then settles back — deterministic, done by ~35% of the build
  const sFull = 900 / (2 * (R + 2.2));
  const sIn = 900 / (2 * 14);
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
  const pad = (n) => String(n).padStart(5, "0");
  const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });
  const shotsAfter = (i) => {
    const p = i / T;
    if (p < 0.45) return i % 2 === 0 ? 1 : 0;
    if (p < 0.70) return 1;
    if (p < 0.85) return 2;
    if (p < 0.93) return 3;
    return 5;
  };

  await setZoom(0);
  for (let j = 0; j < 4; j++) await snap();

  for (let i = 0; i < T; i++) {
    const isLast = i === T - 1;
    if (isLast) {
      for (let j = 0; j < 26; j++) { await snap(); await page.waitForTimeout(35); }
    }
    await page.evaluate((t) => window.__spectre.commitTile(t), tiles[i]);
    const n = isLast ? 6 : shotsAfter(i);
    for (let s = 0; s < n; s++) {
      if (i / T < 0.4) await setZoom(i / T);
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
console.log("ROUND 5 DONE -> " + OUT);
