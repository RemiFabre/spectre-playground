// Substitution patch + guided-mode embedding tests. Run: node test-patch.cjs
const S = require("./spectre.js");

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log("ok   " + name);
  else { console.log("FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); failures++; }
}

const t0 = Date.now();
const patch = S.buildPatch(4);
console.log("     patch built: " + patch.length + " tiles in " + (Date.now() - t0) + "ms");
check("patch has ~4400 tiles", patch.length > 4000 && patch.length < 5000, patch.length);
check("all patch tiles unreflected (det=+1)", patch.every((t) => Math.abs(t.det - 1) < 1e-9));

// rotations are exact multiples of 30 deg (k already snapped; verify no duplicate poses)
{
  const seen = new Set();
  let dup = false;
  for (const t of patch) {
    const key = t.k + ":" + Math.round(t.x * 200) + "," + Math.round(t.y * 200);
    if (seen.has(key)) dup = true;
    seen.add(key);
  }
  check("no duplicate tiles in patch", !dup);
}

// full parity scan: every glued edge pair joins an even edge to an odd edge
{
  const map = new Map();
  let sharedCount = 0, parityOK = true, openEdges = 0;
  for (const t of patch) {
    const vs = S.tileVerts(t);
    for (let e = 0; e < 14; e++) {
      const a = vs[e], b = vs[(e + 1) % 14];
      const key = ((a[0] + b[0]) / 2).toFixed(3) + "," + ((a[1] + b[1]) / 2).toFixed(3);
      if (map.has(key)) { sharedCount++; if (map.get(key) === (e & 1)) parityOK = false; }
      else map.set(key, e & 1);
    }
  }
  openEdges = patch.length * 14 - 2 * sharedCount;
  console.log("     glued edges: " + sharedCount + ", open boundary edges: " + openEdges);
  check("substitution patch obeys odd<->even parity everywhere", parityOK && sharedCount > patch.length * 5);
}

// no overlaps (sample: 400 random tiles against their spatial neighbourhood)
{
  const verts = patch.map((t) => S.tileVerts(t));
  const cents = patch.map((t) => S.tileCentroid(t));
  let overlap = false;
  for (let s = 0; s < 400 && !overlap; s++) {
    const i = (s * 11) % patch.length;
    for (let j = 0; j < patch.length && !overlap; j++) {
      if (i === j) continue;
      if (Math.hypot(cents[i][0] - cents[j][0], cents[i][1] - cents[j][1]) > 2 * S.CIRCUMRADIUS) continue;
      if (S.polysOverlap(verts[i], verts[j])) overlap = true;
    }
  }
  check("no overlaps in patch (sampled)", !overlap);
}

const t1 = Date.now();
const index = new S.PatchIndex(patch);
console.log("     index built in " + (Date.now() - t1) + "ms");
{
  const interiorCount = index.interior.filter(Boolean).length;
  console.log("     interior tiles: " + interiorCount + " / " + patch.length);
  check("most tiles are interior", interiorCount > patch.length * 0.7, interiorCount);
  const nCounts = index.neighbors.map((n) => n.length);
  check("interior tiles have 4..8 neighbours", index.neighbors.every((n, i) => !index.interior[i] || (new Set(n).size >= 4 && new Set(n).size <= 8)));
}

// embeddings of a single tile = one per interior patch tile
{
  const embs = S.computeEmbeddings(index, [{ k: 0, x: 0, y: 0 }]);
  const interiorCount = index.interior.filter(Boolean).length;
  check("single-tile worlds = interior count", embs.length === interiorCount, [embs.length, interiorCount]);
}

// guided growth: 150 random guided placements, never a dead end, always locally valid,
// worlds monotonically non-increasing
{
  let rngState = 987;
  const rng = () => (rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const tiles = [{ k: 0, x: 0, y: 0 }];
  let embs = S.computeEmbeddings(index, tiles);
  let lastWorlds = embs.length, monotone = true, allLocallyValid = true, deadEnd = false;
  const tG = Date.now();
  for (let step = 0; step < 150; step++) {
    const cands = S.guidedCandidates(index, tiles, embs);
    if (!cands.length) { deadEnd = true; break; }
    // guided candidates must be a subset of locally valid candidates
    if (step % 25 === 0) {
      const local = S.generateCandidates(tiles);
      const localKeys = new Set(local.map((c) => c.k + ":" + Math.round(c.x * 200) + "," + Math.round(c.y * 200)));
      for (const c of cands) {
        if (!localKeys.has(c.k + ":" + Math.round(c.x * 200) + "," + Math.round(c.y * 200))) allLocallyValid = false;
      }
    }
    const pick = cands[Math.floor(rng() * cands.length)];
    tiles.push({ k: pick.k, x: pick.x, y: pick.y });
    embs = S.filterEmbeddings(index, embs, pick);
    if (embs.length > lastWorlds) monotone = false;
    lastWorlds = embs.length;
    if (!embs.length) { deadEnd = true; break; }
  }
  console.log("     guided growth: " + tiles.length + " tiles in " + (Date.now() - tG) + "ms, final worlds = " + lastWorlds);
  check("guided growth never dead-ends (151 tiles)", !deadEnd && tiles.length === 151, tiles.length);
  check("guided candidates are always locally valid too", allLocallyValid);
  check("worlds count only shrinks", monotone);
  check("worlds collapsed below initial", lastWorlds < index.interior.filter(Boolean).length);

  // the grown cluster is hole-free: every internal vertex fully surrounded is hard to
  // check directly; instead verify via patch membership, all tiles map into the patch
  // under a surviving embedding, and the patch itself is gap-free by construction.
  check("cluster still embeds in master patch", S.computeEmbeddings(index, tiles).length >= 1);
}

// local-mode traps exist: grow with local rule until worlds hits zero (proves the
// difference between locally valid and globally valid)
{
  let rngState = 5;
  const rng = () => (rngState = (rngState * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let trapped = false;
  for (let attempt = 0; attempt < 10 && !trapped; attempt++) {
    const tiles = [{ k: 0, x: 0, y: 0 }];
    for (let step = 0; step < 25; step++) {
      const cands = S.generateCandidates(tiles);
      if (!cands.length) break;
      const c = cands[Math.floor(rng() * cands.length)];
      tiles.push({ k: c.k, x: c.x, y: c.y });
      if (S.computeEmbeddings(index, tiles).length === 0) { trapped = true; break; }
    }
  }
  check("random local growth can leave the true tiling (worlds -> 0)", trapped);
}

// cropped deeper patch (the on-demand growth path)
{
  const t2 = Date.now();
  const p6 = S.buildPatch(6, 150);
  const idx6 = new S.PatchIndex(p6);
  const r = S.patchRadius(p6);
  console.log("     cropped level-6 R=150: " + p6.length + " tiles, radius " + r.toFixed(0) + ", " + (Date.now() - t2) + "ms");
  check("cropped patch has sane size and radius", p6.length > 5000 && r <= 151, [p6.length, r]);
  check("cropped patch all unreflected", p6.every((t) => Math.abs(t.det - 1) < 1e-9));
  const embs6 = S.computeEmbeddings(idx6, [{ k: 0, x: 0, y: 0 }]);
  check("cropped patch yields embeddings", embs6.length > 4000, embs6.length);
  const cands6 = S.guidedCandidates(idx6, [{ k: 0, x: 0, y: 0 }], embs6);
  check("cropped-patch candidates match level-4 count (25)", cands6.length === 25, cands6.length);
}

console.log(failures === 0 ? "\nALL PATCH TESTS PASSED" : "\n" + failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
