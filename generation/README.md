# generation

The scripts that produced the animations and soundtracks in `../media/`. They drive
the real playground page in a headless Chrome (Playwright), screenshot every frame,
and assemble the result with ffmpeg. All audio is synthesized from scratch in node
(no samples, no libraries), so everything here is original and free to reuse.

## How it works

1. Serve the app and this folder:
   `python3 -m http.server 8377` from the repo root, `python3 -m http.server 8378`
   from this folder.
2. `npm i playwright-core three` somewhere on the path (Playwright uses your
   installed Chrome via `channel: "chrome"`), have `ffmpeg` on the path.
3. Run a capture script with node. Outputs land in `~/Desktop/spectre-gifs/`.

The 2D scripts place tiles through the page's `window.__spectre` hook and screenshot
between placements. The 3D scripts load `capture3d.html` (three.js: the curved tiles
extruded into slabs, a camera rig with tilt/orbit/distance/fov, a progressive-reveal
window, and optional two-sided boards where the underside carries a second color
world). `tower-board-e15.json` is the final board: the sunset mountain above, the pi
world with its gold keystone below.

The sound scripts re-simulate the capture's frame counters to recover the exact time
of every event (each tile's placement, each dissolve removal, the pause, the summit,
the landing), then write 44.1 kHz stereo WAVs sample by sample: Karplus-Strong
plucks, FM bells, pitch-swept kicks, filtered-noise whooshes, a small feedback-delay
reverb. Pitch is mapped from each tile's radius, stereo position from where the tile
sits on screen. ffmpeg muxes the WAV onto the video.

## The files, in story order

- `capture-gifs.mjs` .. `capture-gifs5.mjs`: the 2D rounds. Ring-then-fill, spiral
  fills, camera passes, the color studies (ocean, sunset, pi, brush stroke, golden
  angle, and friends).
- `capture-tower.mjs` .. `capture-tower3.mjs`: the first 3D reveals (flat disc with
  a black monolith, the stepped mountain, the one-shot continuous camera).
- `capture3d.html`: the three.js scene all 3D takes render through.
- `capture-tower5.mjs`, `capture-tower6.mjs`: the two-worlds loop. Build the sunset
  mountain top-down, one continuous orbit that dives below, the pi world dissolving
  rim first, landing flat in front of the glyph.
- `sound-variants.mjs`: the synth library, the event-timeline reconstruction, and
  the first ten scores (plucks, music box, cinematic, techno, pi digits, zen,
  chiptune, pure sound design, echoes, hybrid).
- `sound-v2.mjs` .. `sound-v7.mjs`: the iterations that led to the final score: the
  techno family, the composed A minor theme (Am, F, G, E), four cadence studies,
  and the final "rise" ending where the groove closes with the melody and every
  note tapers to true zero.
- `spectre-core.js`: a copy of the repo's `spectre.js`, kept here so the scripts
  are self-contained.

The final deliverable is `../media/spectre-loop.mp4` (with sound) and
`../media/spectre-loop.gif` (silent). `capture-final.mjs` is the run that produced
it: the placement ripples from the 2D app, recreated in 3D on every tile except the
summit, which was always there.

Note: these scripts are the working tools of an iterative session, kept close to
how they ran. Expect to adjust paths and ports before reusing them.
