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

  // ---- substitution system ---------------------------------------------------
  // Port of the SMKGS Spectre supertile rules (via reversi-fun/symbolic-spectre-tiles,
  // itself a port of the reference implementation). Transforms are [m00,m10,m01,m11,tx,ty]
  // (column-major 2x2 + translation). Each supertile level applies a y-axis mirror,
  // so an EVEN number of iterations yields a patch of unreflected spectres whose
  // rotations are all multiples of 30 deg — a provably correct aperiodic patch.
  function trotT(deg) {
    const r = (deg * Math.PI) / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return [c, s, -s, c, 0, 0];
  }
  const IDENT_T = [1, 0, 0, 1, 0, 0];
  function mulT(A, B) {
    return [
      A[0] * B[0] + A[2] * B[1],
      A[1] * B[0] + A[3] * B[1],
      A[0] * B[2] + A[2] * B[3],
      A[1] * B[2] + A[3] * B[3],
      A[0] * B[4] + A[2] * B[5] + A[4],
      A[1] * B[4] + A[3] * B[5] + A[5],
    ];
  }
  function transPtT(T, p) {
    return [p[0] * T[0] + p[1] * T[2] + T[4], p[0] * T[1] + p[1] * T[3] + T[5]];
  }
  const MIRROR_T = [-1, 0, 0, 1, 0, 0];

  const SUBSTITUTION_RULES = [
    ["Gamma", ["Pi", "Delta", null, "Theta", "Sigma", "Xi", "Phi", "Gamma"]],
    ["Delta", ["Xi", "Delta", "Xi", "Phi", "Sigma", "Pi", "Phi", "Gamma"]],
    ["Theta", ["Psi", "Delta", "Pi", "Phi", "Sigma", "Pi", "Phi", "Gamma"]],
    ["Lambda", ["Psi", "Delta", "Xi", "Phi", "Sigma", "Pi", "Phi", "Gamma"]],
    ["Xi", ["Psi", "Delta", "Pi", "Phi", "Sigma", "Psi", "Phi", "Gamma"]],
    ["Pi", ["Psi", "Delta", "Xi", "Phi", "Sigma", "Psi", "Phi", "Gamma"]],
    ["Sigma", ["Xi", "Delta", "Xi", "Phi", "Sigma", "Pi", "Lambda", "Gamma"]],
    ["Phi", ["Psi", "Delta", "Psi", "Phi", "Sigma", "Pi", "Phi", "Gamma"]],
    ["Psi", ["Psi", "Delta", "Psi", "Phi", "Sigma", "Psi", "Phi", "Gamma"]],
  ];
  const QUAD_IDX = [3, 5, 7, 11];

  // iterations must be EVEN (each substitution level mirrors; even counts restore
  // chirality). cropRadius (optional): keep only tiles whose centroid lies within
  // that distance of the patch centroid — a disc cut from a valid tiling is still
  // a valid patch, and capacity only depends on the radius.
  function buildPatch(iterations, cropRadius) {
    if (iterations === undefined) iterations = 4;
    const quad0 = QUAD_IDX.map((i) => PTS[i].slice());
    // base generation
    let tiles = {};
    const names = SUBSTITUTION_RULES.map((r) => r[0]);
    for (const label of names) {
      if (label === "Gamma") {
        tiles[label] = {
          meta: true, quad: quad0,
          children: [{ meta: false, label: "Gamma1" }, { meta: false, label: "Gamma2" }],
          transforms: [IDENT_T, mulT([1, 0, 0, 1, PTS[8][0], PTS[8][1]], trotT(30))],
        };
      } else {
        tiles[label] = { meta: false, label, quad: quad0 };
      }
    }
    for (let it = 0; it < iterations; it++) {
      const quad = tiles["Delta"].quad;
      let totalAngle = 0;
      let rotation = trotT(0);
      const transformations = [rotation];
      let transformedQuad = quad.map((q) => q.slice());
      for (const [angle, from, to] of [[60, 3, 1], [0, 2, 0], [60, 3, 1], [60, 3, 1], [0, 2, 0], [60, 3, 1], [-120, 3, 3]]) {
        if (angle !== 0) {
          totalAngle += angle;
          rotation = trotT(totalAngle);
          transformedQuad = quad.map((q) => transPtT(rotation, q));
        }
        const prev = transformations[transformations.length - 1];
        const anchor = transPtT(prev, quad[from]);
        const move = [anchor[0] - transformedQuad[to][0], anchor[1] - transformedQuad[to][1]];
        transformations.push(mulT([1, 0, 0, 1, move[0], move[1]], rotation));
      }
      for (let i = 0; i < transformations.length; i++) transformations[i] = mulT(MIRROR_T, transformations[i]);
      const superQuad = [
        transPtT(transformations[6], quad[2]),
        transPtT(transformations[5], quad[1]),
        transPtT(transformations[3], quad[2]),
        transPtT(transformations[0], quad[1]),
      ];
      const next = {};
      for (const [label, subs] of SUBSTITUTION_RULES) {
        const children = [], transforms = [];
        for (let i = 0; i < subs.length; i++) {
          if (!subs[i]) continue;
          children.push(tiles[subs[i]]);
          transforms.push(transformations[i]);
        }
        next[label] = { meta: true, quad: superQuad, children, transforms };
      }
      tiles = next;
    }
    // walk leaves of Delta
    const out = [];
    (function walk(node, T) {
      if (!node.meta) {
        const det = T[0] * T[3] - T[1] * T[2];
        const ang = Math.atan2(T[1], T[0]);
        let k = Math.round((ang * 6) / Math.PI);
        k = ((k % 12) + 12) % 12;
        out.push({ k, x: T[4], y: T[5], label: node.label, det });
        return;
      }
      for (let i = 0; i < node.children.length; i++) walk(node.children[i], mulT(T, node.transforms[i]));
    })(tiles["Delta"], IDENT_T);
    if (!cropRadius) return out;
    let cx = 0, cy = 0;
    const cents = out.map((t) => tileCentroid(t));
    for (const c of cents) { cx += c[0]; cy += c[1]; }
    cx /= out.length; cy /= out.length;
    return out.filter((t, i) => Math.hypot(cents[i][0] - cx, cents[i][1] - cy) <= cropRadius);
  }

  function patchRadius(patchTiles) {
    let cx = 0, cy = 0;
    const cents = patchTiles.map((t) => tileCentroid(t));
    for (const c of cents) { cx += c[0]; cy += c[1]; }
    cx /= patchTiles.length; cy /= patchTiles.length;
    let r = 0;
    for (const c of cents) r = Math.max(r, Math.hypot(c[0] - cx, c[1] - cy));
    return r;
  }

  // ---- patch index + cluster embeddings -------------------------------------
  // PatchIndex answers: is tile (k,x,y) in the master patch? who are a patch
  // tile's neighbours? An embedding maps the user's plane into the patch plane by
  // rotation rho (x12) + translation; the guided mode keeps the set of embeddings
  // consistent with every placed tile, and only offers neighbours that at least
  // one surviving embedding endorses — so every offer extends to a perfect patch.
  const QCELL = 0.05, QTOL = 1e-3;

  const CINV = 1 / QCELL;        // cells per unit
  const COFF = 1 << 20;          // offset so cell indices are positive
  const CSPAN = 1 << 21;         // cell index span per dimension

  function PatchIndex(patchTiles) {
    const M = patchTiles.length;
    this.tiles = patchTiles;
    // tile pose lookup: numeric key (k, cellx, celly) -> [indices]
    this.byCell = new Map();
    for (let i = 0; i < M; i++) {
      const t = patchTiles[i];
      const key = (t.k * CSPAN + (Math.floor(t.x * CINV) + COFF)) * CSPAN + (Math.floor(t.y * CINV) + COFF);
      const arr = this.byCell.get(key);
      if (arr) arr.push(i); else this.byCell.set(key, [i]);
    }
    // adjacency via shared edge midpoints; interior = all 14 edges glued.
    // Edge midpoints stored flat; matching pairs found via numeric spatial hash.
    const midMap = new Map(); // cellKey -> array of edge ids (unmatched so far)
    const mx = new Float64Array(M * N), my = new Float64Array(M * N);
    const glued = new Int8Array(M);
    this.neighbors = new Array(M);
    for (let i = 0; i < M; i++) this.neighbors[i] = [];
    for (let i = 0; i < M; i++) {
      const vs = tileVerts(patchTiles[i]);
      for (let e = 0; e < N; e++) {
        const a = vs[e], b = vs[(e + 1) % N];
        const id = i * N + e;
        const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
        mx[id] = x; my[id] = y;
        const kx = Math.floor(x * CINV) + COFF, ky = Math.floor(y * CINV) + COFF;
        let matched = false;
        for (let ox = -1; ox <= 1 && !matched; ox++) {
          for (let oy = -1; oy <= 1 && !matched; oy++) {
            const arr = midMap.get((kx + ox) * CSPAN + (ky + oy));
            if (!arr) continue;
            for (let j = 0; j < arr.length; j++) {
              const o = arr[j];
              if (Math.abs(mx[o] - x) < QTOL && Math.abs(my[o] - y) < QTOL) {
                const oi = (o / N) | 0;
                this.neighbors[i].push(oi);
                this.neighbors[oi].push(i);
                glued[i]++; glued[oi]++;
                arr[j] = arr[arr.length - 1]; arr.pop(); // edges pair up at most once
                matched = true; break;
              }
            }
          }
        }
        if (!matched) {
          const key = kx * CSPAN + ky;
          const arr = midMap.get(key);
          if (arr) arr.push(id); else midMap.set(key, [id]);
        }
      }
    }
    this.interior = new Array(M);
    for (let i = 0; i < M; i++) this.interior[i] = glued[i] === N;
  }
  PatchIndex.prototype.find = function (k, x, y) {
    const kx = Math.floor(x * CINV) + COFF, ky = Math.floor(y * CINV) + COFF;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const arr = this.byCell.get((k * CSPAN + (kx + ox)) * CSPAN + (ky + oy));
      if (!arr) continue;
      for (const i of arr) {
        const t = this.tiles[i];
        if (Math.abs(t.x - x) < QTOL && Math.abs(t.y - y) < QTOL) return i;
      }
    }
    return -1;
  };

  // embedding = {rho, tx, ty}: user tile (k,x,y) -> patch tile ((k+rho)%12, R_rho*(x,y)+(tx,ty))
  function mapTile(emb, t) {
    const c = COS[emb.rho], s = SIN[emb.rho];
    return { k: (t.k + emb.rho) % 12, x: c * t.x - s * t.y + emb.tx, y: s * t.x + c * t.y + emb.ty };
  }
  function unmapTile(emb, p) {
    const c = COS[emb.rho], s = SIN[emb.rho];
    const dx = p.x - emb.tx, dy = p.y - emb.ty;
    return { k: ((p.k - emb.rho) % 12 + 12) % 12, x: c * dx + s * dy, y: -s * dx + c * dy };
  }

  // all embeddings of the cluster into the patch (interior tiles only).
  // Returns [] if any tile has a non-grid pose (free-mode debris) or none fit.
  function computeEmbeddings(index, userTiles) {
    if (!userTiles.length) return null; // null = unconstrained (empty board)
    for (const t of userTiles) if (!Number.isInteger(t.k)) return [];
    const t0 = userTiles[0];
    const out = [];
    for (let i = 0; i < index.tiles.length; i++) {
      if (!index.interior[i]) continue;
      const p = index.tiles[i];
      const rho = ((p.k - t0.k) % 12 + 12) % 12;
      const c = COS[rho], s = SIN[rho];
      const emb = { rho, tx: p.x - (c * t0.x - s * t0.y), ty: p.y - (s * t0.x + c * t0.y) };
      let ok = true;
      for (let j = 1; j < userTiles.length; j++) {
        const m = mapTile(emb, userTiles[j]);
        const idx = index.find(m.k, m.x, m.y);
        if (idx < 0 || !index.interior[idx]) { ok = false; break; }
      }
      if (ok) out.push(emb);
    }
    return out;
  }

  function filterEmbeddings(index, embeddings, newTile) {
    if (!Number.isInteger(newTile.k)) return [];
    const out = [];
    for (const emb of embeddings) {
      const m = mapTile(emb, newTile);
      const idx = index.find(m.k, m.x, m.y);
      if (idx >= 0 && index.interior[idx]) out.push(emb);
    }
    return out;
  }

  // placements endorsed by at least one embedding; every one extends to a
  // perfect patch. Returns [{k,x,y,cx,cy,support}]
  function guidedCandidates(index, userTiles, embeddings) {
    const placed = new Map();
    for (const t of userTiles) {
      placed.set(t.k + ":" + Math.round(t.x * 200) + "," + Math.round(t.y * 200), true);
    }
    const seen = new Map();
    const out = [];
    for (const emb of embeddings) {
      const imageIdx = new Set();
      let valid = true;
      for (const t of userTiles) {
        const m = mapTile(emb, t);
        const idx = index.find(m.k, m.x, m.y);
        if (idx < 0) { valid = false; break; }
        imageIdx.add(idx);
      }
      if (!valid) continue;
      for (const idx of imageIdx) {
        for (const nIdx of index.neighbors[idx]) {
          if (imageIdx.has(nIdx) || !index.interior[nIdx]) continue;
          const u = unmapTile(emb, index.tiles[nIdx]);
          const key = u.k + ":" + Math.round(u.x * 200) + "," + Math.round(u.y * 200);
          if (placed.has(key)) continue;
          const hit = seen.get(key);
          if (hit) { hit.support++; continue; }
          const cc = tileCentroid(u);
          const cand = { k: u.k, x: u.x, y: u.y, cx: cc[0], cy: cc[1], support: 1 };
          seen.set(key, cand);
          out.push(cand);
        }
      }
    }
    return out;
  }

  const SpectreCore = {
    PTS, N, CENTROID, CIRCUMRADIUS, COS, SIN, BULGE,
    tileVerts, tileCentroid, boundaryEdges, generateCandidates,
    curvedPath, sampleCurved, polysOverlap, pointInPoly, distToPolyBoundary, polyCentroid,
    buildPatch, patchRadius, PatchIndex, computeEmbeddings, filterEmbeddings, guidedCandidates, mapTile, unmapTile,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = SpectreCore;
  if (typeof globalThis !== "undefined") globalThis.SpectreCore = SpectreCore;
})();
