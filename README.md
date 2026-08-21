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

- **Guided mode** — a ghost tile follows your cursor and magnetically snaps to every
  placement allowed by the real matching rule (edge-to-edge, odd edge to even edge,
  rotations only, no overlaps — the curved edges make the rule visible: bumps only
  nest into dents). Dashed outlines show all the valid options near your cursor.
  Click to commit. Some locally valid choices still dead-end globally; that is the
  point.
- **Free mode** — stamp tiles anywhere, no rules, for making figures.
- Right-drag (or quick right-click, or `R`) rotates the held piece, scroll zooms,
  drag pans, erase mode removes tiles, undo with Cmd/Ctrl+Z. Colors either follow
  tile orientation with a slow drift, or stay porcelain white.

The board is saved locally in your browser.

Built with vanilla JS on a single canvas. Geometry engine in `spectre.js`
(tested by `test.cjs`, run with `node test.cjs`).
