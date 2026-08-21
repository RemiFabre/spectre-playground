---
title: the Spectre
emoji: 👻
colorFrom: indigo
colorTo: pink
sdk: static
pinned: false
license: mit
short_description: Tile the aperiodic monotile, one snap at a time
---

# the Spectre — an aperiodic monotile playground

Interactive tiling of the [Spectre](https://arxiv.org/abs/2305.17743) (Smith, Myers,
Kaplan & Goodman-Strauss, 2023), the single shape that tiles the plane but only
aperiodically.

Three placement modes:

- **guided** — only offers placements that provably extend to a perfect, hole-free
  tiling. Every offer is checked against a master patch generated from the Spectre's
  substitution rules (level 4, 4401 tiles, automatically expanded from level 6 — up to
  ~150k tiles — whenever the figure approaches the completeness margin): a placement is
  valid iff the whole figure still embeds somewhere in that patch. The **worlds**
  counter shows how many embeddings survive — every choice destroys worlds; that
  collapse is the information your figure encodes. The full argument for why this
  finds *every* valid placement (and its caveats) is on the site's `about.html`.
- **local** — anything that merely fits its neighbours (edge-to-edge, odd edge to even
  edge, rotations only, no overlap). Locally valid choices can still dead-end: watch
  worlds hit zero when your patch leaves the true tiling.
- **free** — stamp anywhere, no rules, for making figures.

Also: **auto** tiles a disc by itself (outside edge first, then inward), **save**
copies a URL that replays the exact board, three palettes (**color**, the default: hue
follows tile orientation with slow drift; **prisma**: one flowing psychedelic field
across all tiles; **white**: porcelain), erase mode, undo, pan/zoom. The ghost snaps magnetically
to valid spots; right-drag rotates; the curved edges make the matching rule physical —
a bump only nests into a dent.

The board persists in your browser (and in saved URLs).

Built with vanilla JS on a single canvas. Geometry + substitution engine in
`spectre.js`; tests in `test.cjs` and `test-patch.cjs` (run with node).
