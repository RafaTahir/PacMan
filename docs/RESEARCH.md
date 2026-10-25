# Original Pac-Man: implementation reference

This is a behavioral specification for the normal-difficulty 1980 arcade game, not a claim that every hardware detail has been reproduced. The implementation is independently written. No arcade ROM, sound ROM, sprite dump, or third-party game implementation is included by this research.

## Sources and provenance

The primary reference is Jamey Pittman's **The Pac-Man Dossier**, particularly chapters 2–4 and Appendix A. The requested [Phil Rodgers mirror](https://phil.rodgers.ai/pacmandossier/) and original [Holenet mirror](https://pacman.holenet.info/) returned proxy `403` errors in this environment. The complete dossier was instead read from [Xevion's archival mirror](https://xevion.github.io/the-pac-man-dossier/), whose [repository](https://github.com/Xevion/the-pac-man-dossier) explains its restoration and formatting-only changes. Research used revision `b80c03e2ba75069bea5ec741d3782fbf3bdac997`, retrieved 2026-10-25. Links below point to the sections actually consulted in that archival copy.

The dossier credits Namco's original game and reverse engineering by its author and other researchers. Don Hodges' [Pinky overflow analysis](https://donhodges.com/pacman_pinky_explanation.htm) is a further primary reverse-engineering reference linked by the dossier; it could not be fetched here, so the overflow behavior below is sourced to the dossier's explanation rather than an independently verified reading of Hodges' article.

## Maze, movement, and scoring

Source: [The Basics](https://xevion.github.io/the-pac-man-dossier/#CH2_The_Basics), [Speed](https://xevion.github.io/the-pac-man-dossier/#CH2_Speed), [Cornering](https://xevion.github.io/the-pac-man-dossier/#CH2_Cornering), and [Maze Logic](https://xevion.github.io/the-pac-man-dossier/#Chapter_3).

- The native screen is 224 × 288 pixels, or 28 × 36 eight-pixel tiles. A maze-only representation has 28 columns and 31 rows; coordinate conversion must account for the HUD offset.
- There are **240 normal dots and 4 energizers**. Their scores are 10 and 50, giving 2,600 points for all dots on a board. Both count toward board completion, release counters, Elroy thresholds, and fruit triggers.
- Eating a normal dot pauses Pac-Man's movement for one frame. An energizer pauses movement for three frames. Model these pauses separately from his baseline speed rather than applying the approximate dot-eating percentage twice.
- Pac-Man can reverse direction in a corridor. A buffered perpendicular turn should execute at the earliest legal position. Original cornering includes diagonal pre-turn/post-turn movement, not merely a snap at an intersection center. The legal early-turn window is asymmetric: three pixels approaching from the left/top and four from the right/bottom. Ghosts turn at the center.
- The side passage wraps horizontally. Ghosts slow in its marked tunnel zones; Pac-Man does not.
- Fruit appears below the house at **70 and 170 dots eaten**, for a variable duration between nine and ten seconds. Those thresholds are board-progress counts, not dots since a lost life.
- An energizer resets the ghost-eating chain: **200, 400, 800, 1,600** points. A returning pair of eyes is harmless and becomes a normal ghost after revival; it does not automatically become edible again because the original energizer is still active.
- Original collision detection compares actors' occupied tiles. A same-frame tile swap can miss a collision. A radius check or swept collision check is an intentional behavior change if used.

## Level tables

Source: dossier **Appendix A, Table A.1 — Level Specifications**. All percentages use the same baseline; they are not relative to the preceding row. A practical browser approximation uses 75 pixels/second for 100% at a nominal 60 simulation ticks/second. The board's hardware refresh is approximately **60.606061 Hz**; a floating-speed 60 Hz simulation does not reproduce original per-frame movement masks or arcade patterns exactly.

| Level | Pac-Man normal |  Pac-Man frightened | Ghost normal |   Ghost frightened | Ghost tunnel | Elroy 1 speed | Elroy 2 speed |
| ----- | -------------: | ------------------: | -----------: | -----------------: | -----------: | ------------: | ------------: |
| 1     |            80% |                 90% |          75% |                50% |          40% |           80% |           85% |
| 2–4   |            90% |                 95% |          85% |                55% |          45% |           90% |           95% |
| 5–20  |           100% | 100% when available |          95% | 60% when available |          50% |          100% |          105% |
| 21+   |            90% |         unavailable |          95% |        unavailable |          50% |          100% |          105% |

The dossier's effective normal-dot speeds are approximately 71%, 79%, and 87% for baseline Pac-Man speeds of 80%, 90%, and 100%. Effective frightened-dot speeds are approximately 79%, 83%, and 87% for frightened speeds of 90%, 95%, and 100%. These values already include pellet pauses.

| Level | Bonus      | Points | Frightened seconds | Warning flashes | Elroy 1 dots left | Elroy 2 dots left |
| ----- | ---------- | -----: | -----------------: | --------------: | ----------------: | ----------------: |
| 1     | Cherries   |    100 |                  6 |               5 |                20 |                10 |
| 2     | Strawberry |    300 |                  5 |               5 |                30 |                15 |
| 3     | Peach      |    500 |                  4 |               5 |                40 |                20 |
| 4     | Peach      |    500 |                  3 |               5 |                40 |                20 |
| 5     | Apple      |    700 |                  2 |               5 |                40 |                20 |
| 6     | Apple      |    700 |                  5 |               5 |                50 |                25 |
| 7     | Grapes     |  1,000 |                  2 |               5 |                50 |                25 |
| 8     | Grapes     |  1,000 |                  2 |               5 |                50 |                25 |
| 9     | Galaxian   |  2,000 |                  1 |               3 |                60 |                30 |
| 10    | Galaxian   |  2,000 |                  5 |               5 |                60 |                30 |
| 11    | Bell       |  3,000 |                  2 |               5 |                60 |                30 |
| 12    | Bell       |  3,000 |                  1 |               3 |                80 |                40 |
| 13    | Key        |  5,000 |                  1 |               3 |                80 |                40 |
| 14    | Key        |  5,000 |                  3 |               5 |                80 |                40 |
| 15    | Key        |  5,000 |                  1 |               3 |               100 |                50 |
| 16    | Key        |  5,000 |                  1 |               3 |               100 |                50 |
| 17    | Key        |  5,000 |                  0 |               0 |               100 |                50 |
| 18    | Key        |  5,000 |                  1 |               3 |               100 |                50 |
| 19–20 | Key        |  5,000 |                  0 |               0 |               120 |                60 |
| 21+   | Key        |  5,000 |                  0 |               0 |               120 |                60 |

“Peach” and “Grapes” follow this source's naming of the original fruit sprites. Other references sometimes call those symbols orange and melon. The scoring and level assignment are the behavioral requirements.

## Scatter, chase, and frightened behavior

Sources: [Scatter, Chase, Repeat](https://xevion.github.io/the-pac-man-dossier/#CH2_Scatter_Chase_Repeat), [Reversal of Fortune](https://xevion.github.io/the-pac-man-dossier/#CH2_Reversal_of_Fortune), [Frightening Behavior](https://xevion.github.io/the-pac-man-dossier/#CH2_Frightening_Behavior).

| Phase     |    Level 1 |      Levels 2–4 |       Levels 5+ |
| --------- | ---------: | --------------: | --------------: |
| Scatter 1 |        7 s |             7 s |             5 s |
| Chase 1   |       20 s |            20 s |            20 s |
| Scatter 2 |        7 s |             7 s |             5 s |
| Chase 2   |       20 s |            20 s |            20 s |
| Scatter 3 |        5 s |             5 s |             5 s |
| Chase 3   |       20 s |         1,033 s |         1,037 s |
| Scatter 4 |        5 s | 1 nominal frame | 1 nominal frame |
| Chase 4   | indefinite |      indefinite |      indefinite |

- Reset the schedule to Scatter 1 after a death or new board. Pause its elapsed time while frightened; resume the preceding mode afterward.
- Scatter↔chase and entering frightened mode request direction reversals. Frightened expiry does **not** request another reversal. Original reversal takes effect when the ghost next enters a tile, so ghosts need not reverse simultaneously.
- Energizers on zero-frightened-duration boards still trigger reversals; they confer no blue time or ghost-capture opportunity.
- During scatter, use fixed targets outside the maze near Blinky's upper-right, Pinky's upper-left, Inky's lower-right, and Clyde's lower-left corners. Targets need not be reachable or on a corridor.
- Frightened movement tries a pseudorandom direction, then tries successive directions clockwise until it finds a legal non-reverse exit. This differs from uniformly choosing among legal exits. The original PRNG reads bits from game memory, resetting its starting state on each board and after each death. A replacement seeded generator can be deterministic but is not ROM-equivalent.

## Ghost targeting and route choice

Sources: [Looking Ahead](https://xevion.github.io/the-pac-man-dossier/#CH3_Looking_Ahead), [Intersections](https://xevion.github.io/the-pac-man-dossier/#CH3_Intersections), and [Meet the Ghosts](https://xevion.github.io/the-pac-man-dossier/#Chapter_4).

For ordinary scatter/chase motion, exclude walls and the reverse direction. Compare the squared Euclidean distance from each candidate next tile to the target. Tie order is **up, left, down, right**. This is local routing, not shortest-path search. Original ghosts calculate and commit the choice one tile ahead of the turn; recomputing only at the intersection can change a close encounter.

| Ghost  | Chase target                                                                                                                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Blinky | Pac-Man's current tile.                                                                                                                                                                     |
| Pinky  | Four tiles ahead of Pac-Man. When facing up, preserve the bug: four tiles up **and four left**.                                                                                             |
| Inky   | Find a point two tiles ahead of Pac-Man, then double the vector from Blinky to that point: `target = 2 × offset − Blinky`. Facing up shifts the intermediate point two up **and two left**. |
| Clyde  | Target Pac-Man at Euclidean distance **at least eight tiles**; target Clyde's scatter corner when closer. Compare squared distance with 64.                                                 |

Cruise Elroy activates at or below the table's remaining-dot thresholds. It increases Blinky's speed and makes him target Pac-Man during scatter, though mode-change reversals still apply. After a death, disable Elroy until Clyde begins leaving the house; then recompute the correct phase from the board's remaining dots.

The dossier's [restricted-zone illustration](https://xevion.github.io/the-pac-man-dossier/#CH2_Areas_To_Exploit) identifies four junctions where normal ghosts cannot turn upward. In zero-based **maze-only** coordinates these are `(12,11)`, `(15,11)`, `(12,23)`, `(15,23)`. Frightened ghosts ignore this restriction. Keep returning eyes separate from ordinary chase/scatter routing. Tunnel slow zones occupy the outer horizontal side-passage areas; they are distinct from the central passage around the house.

## House release, death, and board transition

Source: [Home Sweet Home](https://xevion.github.io/the-pac-man-dossier/#CH2_Home_Sweet_Home), [Blinky](https://xevion.github.io/the-pac-man-dossier/#CH4_Blinky).

On a fresh board, Blinky starts outside. Inside, Inky is left, Pinky center, Clyde right. Pac-Man cannot pass through the house door. Ghosts use explicit entering, reviving, waiting, and exiting states.

| Board | Pinky personal quota | Inky personal quota | Clyde personal quota |
| ----- | -------------------: | ------------------: | -------------------: |
| 1     |                    0 |                  30 |                   60 |
| 2     |                    0 |                   0 |                   50 |
| 3+    |                    0 |                   0 |                    0 |

Personal counters start at zero on a new board. **Only the highest-priority waiting ghost's counter increments**, in priority Pinky → Inky → Clyde. Therefore Clyde's level-one quota is 60 additional dots after Inky's release, not 60 total board dots. A counter stops counting on exit but keeps its value. Eaten ghosts returning home use these same controls; do not arbitrarily reset their personal counters.

After a death, preserve personal counters but disable them and enable a shared counter starting at zero. Pinky leaves at **exactly 7** shared dots, Inky at **exactly 17**. At **exactly 32**, if Clyde is inside, reset and disable the global counter and resume personal counters. This check does not by itself bypass Clyde's personal quota. If Clyde is absent at 32, the global counter remains active; later returning ghosts can be trapped until the inactivity timeout. Replacing equality checks with `>=` silently removes that original exploit.

A separate no-dot timer is reset whenever a dot is eaten. After four seconds on levels 1–4, or three seconds on levels 5+, release the highest-priority waiting ghost and reset the timer. This also allows a waiting ghost to leave without reaching its dot quota. Normal exit direction is left; a pending mode reversal while inside can make the exiting ghost turn right instead.

On death, retain cleared dots, score, current board, and board-progress fruit milestones. Reset actor positions, frightened status, frightened-chain points, scatter/chase phase, and PRNG state; activate the post-death house-release counter and suspend Elroy as described above. A new board restores all dots, resets personal release counters and fruit milestones, increments the board, and applies its table entry. Life count and extra-life threshold are cabinet settings; a browser adaptation should state its chosen defaults rather than imply they were immutable hardware constants.

## Fidelity boundaries to disclose and verify

These research requirements should be checked against the final implementation, not treated as a checklist of features already present.

- **Movement and timing:** Fixed simulation ticks prevent refresh-rate-dependent gameplay. Exact arcade pattern compatibility additionally needs original discrete movement masks, update order, hardware refresh timing, pre-turn/post-turn geometry, and one-tile-ahead decisions.
- **Randomness:** A deterministic replacement PRNG is useful for testing but differs from the memory-reading arcade generator. Fruit lifetime is separately variable; running a route pattern does not fix it.
- **Collisions:** Preserve tile collision semantics for the original pass-through oddity, or disclose a changed collision model.
- **Presentation:** Independently drawn sprites, synthesized Web Audio, approximated ready/death/score pauses, and omitted attract-mode/intermission animation are adaptations, not original audiovisual assets or exact timing.
- **Level 256:** The original eight-bit fruit-display overflow corrupts the right half of the board and prevents normal completion; see [Deciphering the Split Screen](https://xevion.github.io/the-pac-man-dossier/#Chapter_5). A clean repeating board 256, a deliberate ending, or a decorative glitch is not an emulation of that bug. Document the implemented choice.
- **Testing:** Valuable boundaries include level 17 versus 18 fright time, level 21 Pac-Man slowdown, exact eight-tile Clyde targeting, ties between directions, the upward Pinky/Inky offset, personal versus post-death global release, pause/resume of mode timers, zero-time energizer reversal, and one-time fruit/extra-life awards.
