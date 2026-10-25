# Fidelity checklist

This project recreates the normal-difficulty 1980 game's core rules in a modern browser. It is an independent implementation, not a ROM emulator. “Implemented” below describes behavior present in the code; it does not certify bit-for-bit agreement with original hardware or every possible arcade pattern. Source material and reference tables are in [RESEARCH.md](RESEARCH.md).

## Implemented rules

| Area             | Behavior                                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Maze             | Original 28 × 31 playfield layout, 240 dots, four energizers, restricted house door, and horizontal tunnel wrap.                                                                                                                     |
| Scoring          | Dots 10, energizers 50, fruit 100–5,000, and ghost chain 200/400/800/1,600. Three starting lives and one extra at 10,000 are the chosen cabinet defaults.                                                                            |
| Player movement  | Buffered direction input, corridor reversals, diagonal pre-turn/post-turn cornering with asymmetric three/four-pixel windows, and one/three-frame pellet movement pauses.                                                            |
| Targeting        | Blinky targets Pac-Man; Pinky targets four tiles ahead; Inky doubles the vector from Blinky through the two-tile offset; Clyde retreats below eight tiles of Euclidean distance. Pinky and Inky preserve the upward-left offset bug. |
| Route choice     | Local squared-distance decisions, committed one tile ahead; up/left/down/right tie order; no voluntary reverse; four no-up junctions in normal scatter/chase movement.                                                               |
| Modes            | Level-dependent scatter/chase sequences, including the later single-frame scatter; frightened time pauses the mode clock; mode transitions request reversals. Frightened expiry does not reverse ghosts.                             |
| Energizers       | Per-level frightened duration and warning-flash count, reset capture chain, and zero-duration energizer reversals on late boards. Level 17 has no frightened time; level 18 briefly restores it.                                     |
| Speeds           | Level-dependent player/ghost speeds, tunnel slowdown, frightened speed, two Elroy thresholds, and the level-21 player slowdown.                                                                                                      |
| Elroy            | Blinky speeds up and targets Pac-Man during scatter. After a death this is suspended until Clyde begins exiting the house.                                                                                                           |
| House release    | Sequential personal counters, post-death exact global checks at 7/17/32, the conditional Clyde reset and resulting trap, and no-dot release timeout. Counters survive death according to their respective rules.                     |
| Returning ghosts | Eyes return through the door and revive; regenerated ghosts do not immediately become edible under the same energizer. House entry and exit have separate routes.                                                                    |
| House appearance | Energizers turn waiting and exiting ghosts blue, with the level's warning flashes. Returning ghosts remain eyes; revived ghosts keep normal colors until a new energizer. One or more reversals inside latch a rightward exit. |
| Collision        | Occupied-tile checks, including the possibility of same-frame pass-through when actors swap tiles. Larger rendered sprites do not change collision tiles.                                                                            |
| Fruit            | Board-progress triggers at 70 and 170 dots, a nine-to-ten-second lifetime, level-dependent symbol/score, and recent fruit history.                                                                                                   |
| Board/life reset | Death retains dots and board progress while resetting actors, mode schedule, and frightened state. New boards restore dots and use the next level's configuration.                                                                   |
| Two players      | Alternating turns after death, independent scores/boards/lives/levels, and continuation for the surviving player when the other is out.                                                                                              |

The simulation uses fixed ticks at approximately **60.606061 Hz**, independently of display refresh. Original nominal-second mode/fright/release durations are represented as multiples of 60 timing ticks. Pause and background handling stop simulation instead of allowing a hidden game to run ahead.

## Approximated or reinterpreted

| Area                 | Difference from the cabinet                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-frame movement   | Floating-point movement reproduces average speed ratios rather than the original ROM's pixel-step bit patterns. Cornering and lookahead are implemented, but exact movement/update-order compatibility is not guaranteed.                         |
| Randomness           | Seeded xorshift replaces the arcade's memory-reading PRNG. Frightened direction selection retains clockwise fallback and a resettable seed. Fruit lifetime uses the replacement generator too, so the original random sequence is not reproduced. |
| Presentation         | Actual indexed WebGL Pac-Man, ghost, eye and pellet geometry with normals, lighting and depth, composited onto the unchanged flat Canvas 2D maze. Raster resolution adapts on slow renderers. WebGL failure/loss uses an explicitly labeled 2D fallback without replacing the game. Fruit, HUD and intermissions remain 2D. Original cabinet pixels, colors and display artifacts are not reproduced. |
| Transition timing    | Initial ready is two seconds, post-death ready is 1.5 seconds, death is two seconds, and board clear is 2.8 seconds, with a separate six-second intermission when applicable. These are modern presentation timings.                              |
| Audio                | Independently synthesized Web Audio effects, melodies, and background sound evoke the arcade; no original sound ROM or waveform emulation is used. Audio availability follows browser user-gesture policy.                                        |
| Intermissions        | Original-drawn reinterpretations after boards 2, 5, 9, 13, and 17. Chase and costume gags are adapted rather than exact cabinet animation sequences.                                                                                              |
| Attract mode         | An automated demonstration uses the same engine with a modern steering routine, not the cabinet's recorded demonstration route.                                                                                                                   |
| Browser conveniences | Pause with a safe resume countdown, restart confirmation, touch controls, responsive large/cabinet layout, native fullscreen with fallback, optional queued-turn/power cues, contextual tips, higher contrast, reduced motion, and browser-local best/settings are additions. No persistent game-state save is provided. |

## Omitted

- Level-256 fruit-display overflow and the resulting split-screen corruption. The game deliberately continues with later-board rules instead of ending or emulating the unfinishable corrupted board.
- ROM execution, original per-frame pixel masks, exact ROM PRNG data, and guaranteed compatibility with published arcade movement patterns.
- Cabinet coin accounting, service/DIP-switch interfaces, configurable hard-difficulty level remapping, and exhaustive reproduction of hardware/overflow quirks.
- The house-door capture/vertical-wrap exploit: exiting ghosts become collision-active after their exit route completes, so that original edge-case capture is not reproduced.
- Original sprite/sound assets and frame-exact intermission, attract, and transition sequences.
- A complete nonvisual gameplay mode. Accessible menus and announcements supplement a primarily visual canvas game.

## Verification

`npm test` runs behavioral regression checks for the engine and rule boundaries. `npm run build` checks TypeScript and produces the production bundle. `python3 tests/browser_smoke.py`, with the development server running and its separate browser dependencies installed, exercises the interface in Chromium. Test totals and results should be taken from the current run, not inferred from this document.

The regression suite covers targeting formulas and the up-offset bug, direction tie breaks and restricted junctions, one-tile lookahead, schedule/reversal boundaries, house counters and the post-death trap, returning ghosts, level tables, Elroy, fruit/scoring, tile collisions, cornering, and reset/pause behavior. Browser checks use real keyboard/pointer input for controls and development-only state fixtures for rare transitions. Mobile layouts are exercised in Chromium viewports, not certified on physical mobile hardware. These checks provide evidence for selected cases; they do not establish complete ROM equivalence or certify every browser and device.
