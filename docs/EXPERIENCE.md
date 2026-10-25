# Player experience update

The design borrows lessons about learning, readability, agency and recoverable mistakes from a representative selection of major games with puzzles. This is not an exhaustive survey of every AAA game. Pac-Man's maze, movement windows, ghost targeting, scoring, timers and difficulty remain the same.

## Research translated into this game

| Design lesson and source | Pac-Man application |
| --- | --- |
| Consistent affordances and player-owned solutions — Nintendo, [Tears of the Kingdom developer interview, chapter 5](https://www.nintendo.com/au/news-and-articles/ask-the-developer-vol-9-the-legend-of-zelda-tears-of-the-kingdom-chapter-5/) | Confirm the player's existing buffered direction with a small NEXT arrow. The newest request still wins, and the engine decides when movement is legal. No route solver or compulsory puzzle is added. |
| Paced introduction and recoverable mistakes — [Valve on Portal 2](https://www.gamedeveloper.com/design/rewarding-the-players-valve-on-i-portal-2-i-) | Put practical controls on the opening screen, deliver brief contextual tips while the maze is already still, and give a cancellable countdown when returning to active play. |
| Distinct types of assistance — [Tomb Raider accessibility discussion](https://blog.playstation.com/?p=203510) | Optional play cues change the information shown, without silently changing ghost difficulty, movement or arcade records. |
| Contrast, audio and motion options — [God of War Ragnarök accessibility](https://www.playstation.com/en-us/games/god-of-war-ragnarok/accessibility/) | Keep persistent mute/reduced motion, add higher contrast, and provide static frightened-expiry text that does not require flashing or sound. Puzzle timing controls in that source are not treated as a hint-delay specification. |
| Optional help and visual equivalents for audio — [The Last of Us Part II accessibility](https://www.naughtydog.com/blog/the_last_of_us_part_ii_accessibility_features_detailed) | Make tips dismissible, keep play cues optional, and show the actual frightened clock beside the maze. A timer never means that every ghost is harmless. |

These are design inspirations. No art, sound recordings, dialogue, proprietary game code or puzzle layouts were copied from these games.

## Player-visible behavior

- The title explains movement and early turns in the large view, where the decorative side guides are hidden.
- NEXT shows a pending direction until it matches Pac-Man's actual direction. The queue already existed; the display adds confirmation without changing input timing.
- Blue-time feedback reads the engine's remaining frightened time, including a fresh energizer. Its static expiry warning works with reduced motion and mute. The accessible label reports how many roaming ghosts are actually edible; returning eyes and revived normal ghosts never count as edible.
- Resuming active play uses a three-second countdown. Movement, enemies, fruit, frightened time and score stay frozen, while the player can queue the next direction. Pause/Keep paused cancels it. Leaving the page cancels it and requires a deliberate resume. Help and restart cancellation use the same safe return. Original ready and intermission timings remain unchanged.
- Brief first-use tips appear only during ready or an ordinary pause. They never interrupt a moving maze and can be dismissed. Play cues and higher contrast are stored alongside the existing sound, motion and view preferences, with an in-memory fallback when browser storage is unavailable.
- Interactive controls have at least 44 by 44 CSS-pixel targets. The complete maze and its aspect ratio continue to fit the viewport; compact layouts reduce decoration and fruit-history display before sacrificing the playfield.
- Higher contrast strengthens interface text and the flat maze outline. Actors and pellets remain actual indexed, lit WebGL meshes. The existing explicitly labeled Canvas fallback and context recovery remain available.

## Scope and validation limits

No mandatory new puzzle, currency, progression tree, cinematic camera, gameplay slowdown, hidden AI-target display or practice record category is added. Existing synthesized feedback and the fixed simulation remain intact. Rendering and input cues do not consume the simulation's random generator or event queue.

See [VALIDATION.md](VALIDATION.md) for checked results and [FIDELITY.md](FIDELITY.md) for arcade differences. Cloud Chromium viewport tests are not physical-phone certification. Source/build handoff and publication are separate steps; this document does not claim a new public release.
