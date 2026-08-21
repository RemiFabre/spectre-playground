// Geometry engine tests for the Spectre playground. Run: node test.cjs
const S = require("./spectre.js");

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra !== undefined ? "  -> " + extra : "")); failures++; }
}

// --- 1. base polygon sanity --------------------------------------------------
{
  const p = S.PTS;
  check("14 vertices", p.length === 14);
  let allUnit = true;
  for (let i = 0; i < 14; i++) {
    const [ax, ay] = p[i], [bx, by] = p[(i + 1) % 14];
    if (Math.abs(Math.hypot(bx - ax, by - ay) - 1) > 1e-9) allUnit = false;
  }
  check("all edges unit length", allUnit);
  // interior angles: 90 or 120 (one straight 180)
  const angs = [];
  for (let i = 0; i < 14; i++) {
    const a = p[(i + 13) % 14], b = p[i], c = p[(i + 1) % 14];
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    angs.push(Math.round((Math.acos(dot) * 180) / Math.PI));
  }
  const straight = angs.filter((a) => a === 180).length;
  const ok = angs.every((a) => a === 90 || a === 120 || a === 180);
  check("angles are 90/120 with one 180", ok && straight === 1, JSON.stringify(angs));
}

// --- 2. gluing math ----------------------------------------------------------
{
  const t0 = { k: 0, x: 0, y: 0 };
  const cands = S.generateCandidates([t0]);
  check("candidates around one tile exist", cands.length > 10, cands.length);
  console.log("     candidates around a single tile: " + cands.length);
  // each candidate shares at least one full edge, opposite parity, no overlap
  const v0 = S.tileVerts(t0);
  let allGood = true;
  for (const c of cands) {
    const vc = S.tileVerts(c);
    if (S.polysOverlap(vc, v0)) { allGood = false; break; }
  }
  check("no candidate overlaps the seed tile", allGood);
}

// --- 3. grow a random cluster with the engine --------------------------------
{
  let rngState = 12345;
  const rng = () => (rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const tiles = [{ k: 0, x: 0, y: 0 }];
  for (let step = 0; step < 60; step++) {
    const cands = S.generateCandidates(tiles);
    if (cands.length === 0) { console.log("     dead end at " + tiles.length + " tiles"); break; }
    tiles.push(cands[Math.floor(rng() * cands.length)]);
  }
  check("grew cluster to 61 tiles", tiles.length === 61, tiles.length);
  // no pair overlaps
  const verts = tiles.map(S.tileVerts);
  let overlap = false;
  for (let i = 0; i < tiles.length && !overlap; i++)
    for (let j = i + 1; j < tiles.length && !overlap; j++)
      if (S.polysOverlap(verts[i], verts[j])) overlap = true;
  check("no overlaps in grown cluster", !overlap);

  // every shared edge has opposite parity
  const map = new Map();
  let parityOK = true, shared = 0;
  for (let ti = 0; ti < tiles.length; ti++) {
    for (let ei = 0; ei < 14; ei++) {
      const a = verts[ti][ei], b = verts[ti][(ei + 1) % 14];
      const key = [((a[0] + b[0]) / 2).toFixed(3), ((a[1] + b[1]) / 2).toFixed(3)].join(",");
      if (map.has(key)) { shared++; if (map.get(key) === (ei & 1)) parityOK = false; }
      else map.set(key, ei & 1);
    }
  }
  check("all shared edges have opposite parity (" + shared + " glued edges)", parityOK && shared > 60);

  // --- 4. curved outlines: glued edges coincide, non-glued don't clash -------
  // sample curved outline of every tile; for each pair of tiles, no sampled point
  // of one may fall strictly inside the *curved* region of the other.
  // Approximate: check sampled point of A strictly inside straight poly of B by
  // more than the bulge reach (0.75*BULGE), which would mean real intrusion.
  const reach = 0.75 * S.BULGE + 1e-3;
  let intrude = false;
  const samples = tiles.map((t) => S.sampleCurved(S.tileVerts(t), 10));
  for (let i = 0; i < tiles.length && !intrude; i++) {
    for (let j = 0; j < tiles.length && !intrude; j++) {
      if (i === j) continue;
      const ci = S.tileCentroid(tiles[i]), cj = S.tileCentroid(tiles[j]);
      if (Math.hypot(ci[0] - cj[0], ci[1] - cj[1]) > 2 * S.CIRCUMRADIUS + 1) continue;
      for (const [px, py] of samples[i]) {
        if (S.pointInPoly(px, py, verts[j]) && S.distToPolyBoundary(px, py, verts[j]) > reach) {
          intrude = true; break;
        }
      }
    }
  }
  check("curved outlines do not intrude into neighbours", !intrude);

  // curved edges on glued pairs coincide: distance from each sample of A's glued
  // edge curve to B's sampled outline is tiny.
  // Pick one glued pair from the map by re-scanning.
  let coincideOK = true, checked = 0;
  const edgeOwners = new Map();
  for (let ti = 0; ti < tiles.length; ti++) {
    for (let ei = 0; ei < 14; ei++) {
      const a = verts[ti][ei], b = verts[ti][(ei + 1) % 14];
      const key = [((a[0] + b[0]) / 2).toFixed(3), ((a[1] + b[1]) / 2).toFixed(3)].join(",");
      if (edgeOwners.has(key)) {
        const o = edgeOwners.get(key);
        // sample both curves for this edge
        const segA = S.curvedPath(verts[ti])[ei];
        const segB = S.curvedPath(verts[o.ti])[o.ei];
        for (let u = 0; u <= 10; u++) {
          const t = u / 10, v = 1 - t;
          const ax = v ** 3 * segA.x0 + 3 * v * v * t * segA.c1x + 3 * v * t * t * segA.c2x + t ** 3 * segA.x1;
          const ay = v ** 3 * segA.y0 + 3 * v * v * t * segA.c1y + 3 * v * t * t * segA.c2y + t ** 3 * segA.y1;
          // same physical point should appear on B's curve at parameter 1-t
          const tb = 1 - t, vb = 1 - tb;
          const bx2 = vb ** 3 * segB.x0 + 3 * vb * vb * tb * segB.c1x + 3 * vb * tb * tb * segB.c2x + tb ** 3 * segB.x1;
          const by2 = vb ** 3 * segB.y0 + 3 * vb * vb * tb * segB.c1y + 3 * vb * tb * tb * segB.c2y + tb ** 3 * segB.y1;
          if (Math.hypot(ax - bx2, ay - by2) > 1e-6) coincideOK = false;
        }
        checked++;
      } else edgeOwners.set(key, { ti, ei });
    }
  }
  check("curved glued edges coincide exactly (" + checked + " pairs)", coincideOK && checked > 60);

  // --- 5. curved outline has no self-intersection near corners ----------------
  let selfX = false;
  const one = S.sampleCurved(S.tileVerts({ k: 0, x: 0, y: 0 }), 16);
  const M = one.length;
  for (let i = 0; i < M && !selfX; i++) {
    const a = one[i], b = one[(i + 1) % M];
    for (let j = i + 2; j < M; j++) {
      if (i === 0 && j === M - 1) continue;
      const c = one[j], d = one[(j + 1) % M];
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
      const den = rx * sy - ry * sx;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
      const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) { selfX = true; break; }
    }
  }
  check("curved outline is simple (no self-intersection)", !selfX);
}

// --- 6. removal keeps engine consistent -------------------------------------
{
  const tiles = [{ k: 0, x: 0, y: 0 }];
  for (let step = 0; step < 12; step++) {
    const cands = S.generateCandidates(tiles);
    tiles.push(cands[0]);
  }
  tiles.splice(4, 1); // remove a middle tile
  const cands = S.generateCandidates(tiles);
  check("candidates exist after mid-cluster removal", cands.length > 0, cands.length);
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : "\n" + failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
