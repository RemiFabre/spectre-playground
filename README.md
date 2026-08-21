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

- **guided** — only offers placements that extend to a perfect
  tiling. Every offer is checked against a master patch generated from the Spectre's
  substitution rules (level 4, 4401 tiles, automatically expanded from level 6 — up to
  ~150k tiles — whenever the figure approaches the completeness margin): a placement is
  valid iff the whole figure still embeds somewhere in that patch. The **worlds**
  counter shows how many embeddings survive (every choice destroys worlds). The full argument for why this
  finds *every* valid placement is on the site's `about.html`.
- **local** — any edge-to-edge (worlds hit zero if perfect tiling is no longer possible).
- **free** — stamp anywhere.

Also: **auto** tiles a disc by itself (outside edge first, then inward), **save**
copies a URL that replays the exact board, three palettes, erase mode, undo, pan/zoom.
Right-drag rotates, middle-drag pans.

The board persists in your browser (and in saved URLs).

Built with vanilla JS on a single canvas. Geometry + substitution engine in
`spectre.js`; tests in `test.cjs` and `test-patch.cjs` (run with node).
