import { chromium } from "playwright-core";
import { mkdirSync, rmSync } from "fs";
import { execSync } from "child_process";
import os from "os";

const OUT = os.homedir() + "/Desktop/spectre-gifs";
mkdirSync(OUT, { recursive: true });

const TAKES = [
  { name: "A-rings-small", R: 13, mode: "rings", palette: "prisma", shotsPerTile: 2 },
  { name: "B-rings-large", R: 17, mode: "rings", palette: "prisma", shotsPerTile: 1 },
  { name: "C-spiral-large", R: 17, mode: "spiral", palette: "prisma", shotsPerTile: 1 },
  { name: "D-white-small", R: 13, mode: "rings", palette: "white", shotsPerTile: 2 },
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

  // reset board, set palette + view, compute the placement plan from the master patch
  const plan = await page.evaluate(([R, mode, palette]) => {
    const W = window.__spectre, S = window.SpectreCore;
    const st = W.state;
    st.tiles.length = 0; st.undo.length = 0; st.embeddings = null;
    st.mode = "guided"; st.palette = palette;
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
    const center = picks.shift(); // saved for the very end
    const BAND = 3.4;
    const ring = picks.filter((p) => p.d >= R - 3.6).sort((a, b) => a.ang - b.ang);
    const inner = picks.filter((p) => p.d < R - 3.6);
    if (mode === "rings") {
      inner.sort((a, b) => Math.floor((R - a.d) / BAND) - Math.floor((R - b.d) / BAND) || a.ang - b.ang);
    } else {
      for (const p of inner) p.key = p.ang + ((R - p.d) / BAND) * 2 * Math.PI;
      inner.sort((a, b) => a.key - b.key);
    }
    const order = ring.concat(inner, [center]);
    // frame the disc: its center at canvas center
    st.view.scale = 900 / (2 * (R + 2.2));
    st.view.ox = 450; st.view.oy = 450;
    return {
      ringCount: ring.length,
      tiles: order.map((p) => ({ k: P[p.i].k, x: P[p.i].x - O[0], y: P[p.i].y - O[1] })),
    };
  }, [take.R, take.mode, take.palette]);

  console.log(take.name + ": " + plan.tiles.length + " tiles (" + plan.ringCount + " in the ring)");

  let f = 0;
  const pad = (n) => String(n).padStart(5, "0");
  const snap = () => page.screenshot({ path: `${dir}/f${pad(f++)}.png` });

  // a beat of empty board
  for (let i = 0; i < 8; i++) { await snap(); await page.waitForTimeout(50); }

  const tiles = plan.tiles;
  for (let i = 0; i < tiles.length; i++) {
    const isLast = i === tiles.length - 1;
    if (isLast) {
      // dramatic pause before the final center piece
      for (let j = 0; j < 22; j++) { await snap(); await page.waitForTimeout(60); }
    }
    await page.evaluate((t) => window.__spectre.commitTile(t), tiles[i]);
    await snap();
    for (let s = 1; s < take.shotsPerTile; s++) { await page.waitForTimeout(60); await snap(); }
    if (i === plan.ringCount - 1) {
      // ring complete: let it breathe before the fill starts
      for (let j = 0; j < 14; j++) { await snap(); await page.waitForTimeout(60); }
    }
  }
  // hold on the finished disc while the field keeps flowing
  for (let j = 0; j < 45; j++) { await snap(); await page.waitForTimeout(70); }
  await page.close();

  execSync(`ffmpeg -y -loglevel error -framerate 22 -i "${dir}/f%05d.png" -c:v libx264 -pix_fmt yuv420p -crf 20 "${OUT}/${take.name}.mp4"`);
  execSync(`ffmpeg -y -loglevel error -framerate 22 -i "${dir}/f%05d.png" -vf "fps=18,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" "${OUT}/${take.name}.gif"`);
  rmSync(dir, { recursive: true, force: true });
  console.log("  -> " + take.name + ".gif / .mp4 done");
}

await browser.close();
console.log("ALL TAKES DONE -> " + OUT);
