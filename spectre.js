/* Spectre core geometry.
 * Tile(1,1) — the equilateral 14-gon underlying the Spectre aperiodic monotile
 * (Smith, Myers, Kaplan, Goodman-Strauss 2023).
 *
 * Matching rule implemented here (straight-edge equivalent of the curved Spectre):
 *   - translations + rotations by multiples of 30° only, never reflections
 *   - tiles meet full unit-edge to full unit-edge
 *   - an edge of even index may only be glued to an edge of odd index
 *   - no area overlap
 * The curved rendering (symmetric bump, sign alternating with edge parity) makes
 * the parity rule physical: bumps only fit into dents.
 */
(function () {
  const SQ3_2 = Math.sqrt(3) / 2;

  // Vertices of Tile(1,1), unit edge length. 14 edges; edge i runs PTS[i] -> PTS[i+1 mod 14].
  const PTS = [
    [0, 0],
    [1, 0],
    [1.5, -SQ3_2],
    [1.5 + SQ3_2, 0.5 - SQ3_2],
    [1.5 + SQ3_2, 1.5 - SQ3_2],
    [2.5 + SQ3_2, 1.5 - SQ3_2],
    [3 + SQ3_2, 1.5],
    [3, 2],
    [3 - SQ3_2, 1.5],
    [2.5 - SQ3_2, 1.5 + SQ3_2],
    [1.5 - SQ3_2, 1.5 + SQ3_2],
    [0.5 - SQ3_2, 1.5 + SQ3_2],
    [-SQ3_2, 1.5],
    [0, 1],
  ];
  const N = 14;

  const CENTROID = (() => {
    // area centroid of the polygon
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < N; i++) {
      const [x0, y0] = PTS[i], [x1, y1] = PTS[(i + 1) % N];
      const w = x0 * y1 - x1 * y0;
      a += w; cx += (x0 + x1) * w; cy += (y0 + y1) * w;
    }
    a *= 0.5;
    return [cx / (6 * a), cy / (6 * a)];
  })();

  const CIRCUMRADIUS = Math.max(...PTS.map(([x, y]) => Math.hypot(x - CENTROID[0], y - CENTROID[1])));

  const COS = [], SIN = [];
  for (let k = 0; k < 12; k++) {
    COS.push(Math.cos((k * Math.PI) / 6));
    SIN.push(Math.sin((k * Math.PI) / 6));
  }

  // tile = {k, x, y}  (rotation k*30°, then translate)
  function tileVerts(t) {
    const c = COS[t.k], s = SIN[t.k];
    const out = new Array(N);
    for (let i = 0; i < N; i++) {
      const [px, py] = PTS[i];
      out[i] = [c * px - s * py + t.x, s * px + c * py + t.y];
    }
    return out;
  }

  function tileCentroid(t) {
    const c = COS[t.k], s = SIN[t.k];
    return [c * CENTROID[0] - s * CENTROID[1] + t.x, s * CENTROID[0] + c * CENTROID[1] + t.y];
  }

  // ---- small geometry helpers ------------------------------------------------

  function pointInPoly(px, py, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const [xi, yi] = verts[i], [xj, yj] = verts[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  function distToPolyBoundary(px, py, verts) {
    let best = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const [ax, ay] = verts[i], [bx, by] = verts[(i + 1) % verts.length];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d < best) best = d;
    }
    return best;
  }

  const EPS = 1e-4;

  // proper interior crossing of segments (touching at endpoints / collinear contact ignored)

  function properCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    const denom = rx * sy - ry * sx;
    if (Math.abs(denom) < 1e-9) return false; // parallel / collinear: not a proper crossing
    const t = ((cx - ax) * sy - (cy - ay) * sx) / denom;
    const u = ((cx - ax) * ry - (cy - ay) * rx) / denom;
    return t > EPS && t < 1 - EPS && u > EPS && u < 1 - EPS;
  }

  function polysOverlap(A, B) {
    // strict vertex containment
    for (const [px, py] of A) {
      if (pointInPoly(px, py, B) && distToPolyBoundary(px, py, B) > 1e-3) return true;
    }
    for (const [px, py] of B) {
      if (pointInPoly(px, py, A) && distToPolyBoundary(px, py, A) > 1e-3) return true;
    }
    // proper edge crossings
    for (let i = 0; i < A.length; i++) {
      const [ax, ay] = A[i], [bx, by] = A[(i + 1) % A.length];
      for (let j = 0; j < B.length; j++) {
        const [cx, cy] = B[j], [dx, dy] = B[(j + 1) % B.length];
        if (properCross(ax, ay, bx, by, cx, cy, dx, dy)) return true;
      }
    }
    // identical / contained without strict vertices (stacked tiles)
    const ca = polyCentroid(A), cb = polyCentroid(B);
    if (pointInPoly(ca[0], ca[1], B) && distToPolyBoundary(ca[0], ca[1], B) > 1e-3) return true;
    if (pointInPoly(cb[0], cb[1], A) && distToPolyBoundary(cb[0], cb[1], A) > 1e-3) return true;
    return false;
  }

  function polyCentroid(verts) {
    let x = 0, y = 0;
    for (const [vx, vy] of verts) { x += vx; y += vy; }
    return [x / verts.length, y / verts.length];
  }

  function samePt(a, b, tol) {
    return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;
  }

  // ---- boundary edges --------------------------------------------------------
  // Returns edges of the union boundary: edges appearing exactly once.
  // Each: {a, b, parity, tileIndex, edgeIndex} with a->b as traversed by its tile.
  function boundaryEdges(tiles, vertsCache) {
    const cell = 0.05, tol = 1e-3;
    const map = new Map(); // cellKey -> array of edge records with midpoint
    const all = [];
    for (let ti = 0; ti < tiles.length; ti++) {
      const vs = vertsCache ? vertsCache[ti] : tileVerts(tiles[ti]);
      for (let ei = 0; ei < N; ei++) {
        const a = vs[ei], b = vs[(ei + 1) % N];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const rec = { a, b, m, parity: ei & 1, tileIndex: ti, edgeIndex: ei, matched: false };
        all.push(rec);
        const kx = Math.floor(m[0] / cell), ky = Math.floor(m[1] / cell);
        // match against neighbors
        for (let ox = -1; ox <= 1 && !rec.matched; ox++) {
          for (let oy = -1; oy <= 1 && !rec.matched; oy++) {
            const arr = map.get((kx + ox) + "," + (ky + oy));
            if (!arr) continue;
            for (const other of arr) {
              if (!other.matched && samePt(other.m, m, tol)) {
                other.matched = true; rec.matched = true;
                rec.partner = other; other.partner = rec;
                break;
              }
            }
          }
        }
        const key = kx + "," + ky;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(rec);
      }
    }
    return all.filter((e) => !e.matched);
  }

  // ---- candidate generation --------------------------------------------------
  // All placements of a new tile gluing one of its edges to a boundary edge,
  // opposite parity, no overlap, and every incidental edge contact also
  // opposite parity. Returns [{k, x, y, cx, cy, anchors}]
  function generateCandidates(tiles) {
    const vertsCache = tiles.map(tileVerts);
    const centroids = tiles.map((t, i) => polyCentroid(vertsCache[i]));
    const boundary = boundaryEdges(tiles, vertsCache);
    const out = [];
    const seen = new Map(); // dedupe: k -> Map(cellKey -> [t])
    const tol = 1e-3;

    // index of ALL edges (for parity check on incidental contacts)
    const edgeIndex = new Map(); // cellKey of midpoint -> [{m, parity}]
    for (let ti = 0; ti < tiles.length; ti++) {
      const vs = vertsCache[ti];
      for (let ei = 0; ei < N; ei++) {
        const a = vs[ei], b = vs[(ei + 1) % N];
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const key = Math.floor(m[0] / 0.05) + "," + Math.floor(m[1] / 0.05);
        if (!edgeIndex.has(key)) edgeIndex.set(key, []);
        edgeIndex.get(key).push({ m, parity: ei & 1 });
      }
    }
    const lookupEdgeParity = (m) => {
      const kx = Math.floor(m[0] / 0.05), ky = Math.floor(m[1] / 0.05);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const arr = edgeIndex.get((kx + ox) + "," + (ky + oy));
        if (!arr) continue;
        for (const e of arr) if (samePt(e.m, m, tol)) return e.parity;
      }
      return null;
    };

    for (const be of boundary) {
      for (let f = 0; f < N; f++) {
        if ((f & 1) === be.parity) continue; // parity rule
        // place new tile so its edge f (q0->q1) lands on be reversed (b->a)
        const q0 = PTS[f], q1 = PTS[(f + 1) % N];
        const want = Math.atan2(be.a[1] - be.b[1], be.a[0] - be.b[0]);
        const have = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]);
        let k = Math.round(((want - have) * 6) / Math.PI);
        k = ((k % 12) + 12) % 12;
        const c = COS[k], s = SIN[k];
        const tx = be.b[0] - (c * q0[0] - s * q0[1]);
        const ty = be.b[1] - (s * q0[0] + c * q0[1]);

        // dedupe
        let byCell = seen.get(k);
        if (!byCell) { byCell = new Map(); seen.set(k, byCell); }
        const ckx = Math.floor(tx / 0.05), cky = Math.floor(ty / 0.05);
        let dup = false;
        for (let ox = -1; ox <= 1 && !dup; ox++) for (let oy = -1; oy <= 1 && !dup; oy++) {
          const arr = byCell.get((ckx + ox) + "," + (cky + oy));
          if (arr) for (const p of arr) if (Math.abs(p[0] - tx) < tol && Math.abs(p[1] - ty) < tol) { dup = true; break; }
        }
        if (dup) continue;
        const ck = ckx + "," + cky;
        if (!byCell.has(ck)) byCell.set(ck, []);
        byCell.get(ck).push([tx, ty]);

        const cand = { k, x: tx, y: ty };
        const cvs = tileVerts(cand);
        const cc = polyCentroid(cvs);

        // overlap check against nearby tiles
        let bad = false;
        for (let ti = 0; ti < tiles.length && !bad; ti++) {
          const d = Math.hypot(cc[0] - centroids[ti][0], cc[1] - centroids[ti][1]);
          if (d > 2 * CIRCUMRADIUS + 0.1) continue;
          if (polysOverlap(cvs, vertsCache[ti])) bad = true;
        }
        if (bad) continue;

        // every coincident edge must be opposite parity
        let contacts = 0;
        for (let ei = 0; ei < N && !bad; ei++) {
          const a = cvs[ei], b = cvs[(ei + 1) % N];
          const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          const p = lookupEdgeParity(m);
          if (p !== null) {
            contacts++;
            if (p === (ei & 1)) bad = true; // parity clash on an incidental contact
          }
        }
        if (bad || contacts === 0) continue;

        out.push({ k, x: tx, y: ty, cx: cc[0], cy: cc[1], contacts });
      }
    }
    return out;
  }

  // ---- curved outline --------------------------------------------------------
  // Each unit edge becomes a cubic bezier bulging perpendicular to the edge.
  // Symmetric profile, sign alternating with edge parity: even edges bulge
  // outward (left of travel), odd edges inward — so a bump nests into a dent
  // exactly when parities are opposite, which is the Spectre matching rule.
  const BULGE = 0.22;

  function curvedPath(verts, bulge) {
    const b = bulge === undefined ? BULGE : bulge;
    const segs = [];
    for (let i = 0; i < N; i++) {
      const [ax, ay] = verts[i], [bx, by] = verts[(i + 1) % N];
      const dx = bx - ax, dy = by - ay;
      const nx = -dy, ny = dx; // left normal
      const s = (i & 1) === 0 ? 1 : -1;
      segs.push({
        x0: ax, y0: ay,
        c1x: ax + dx / 3 + s * b * nx, c1y: ay + dy / 3 + s * b * ny,
        c2x: ax + (2 * dx) / 3 + s * b * nx, c2y: ay + (2 * dy) / 3 + s * b * ny,
        x1: bx, y1: by,
      });
    }
    return segs;
  }

  function sampleCurved(verts, perEdge, bulge) {
    const segs = curvedPath(verts, bulge);
    const pts = [];
    for (const g of segs) {
      for (let j = 0; j < perEdge; j++) {
        const t = j / perEdge, u = 1 - t;
        pts.push([
          u * u * u * g.x0 + 3 * u * u * t * g.c1x + 3 * u * t * t * g.c2x + t * t * t * g.x1,
          u * u * u * g.y0 + 3 * u * u * t * g.c1y + 3 * u * t * t * g.c2y + t * t * t * g.y1,
        ]);
      }
    }
    return pts;
  }

  const SpectreCore = {
    PTS, N, CENTROID, CIRCUMRADIUS, COS, SIN, BULGE,
    tileVerts, tileCentroid, boundaryEdges, generateCandidates,
    curvedPath, sampleCurved, polysOverlap, pointInPoly, distToPolyBoundary, polyCentroid,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = SpectreCore;
  if (typeof globalThis !== "undefined") globalThis.SpectreCore = SpectreCore;
})();
