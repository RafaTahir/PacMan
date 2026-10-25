# Pac-Man in the arcade

The original game remains available at `/pacman.html`. Opening that page directly keeps its original classic timing, one/two-player selection, alternating turns, attract sequence, mesh/2D rendering, synthesized audio, pause, restart confirmation, help, intermissions, keyboard, swipe and D-pad controls. The engine, maze, levels, original renderer/audio and view controls are unchanged.

The arcade mounts `/pacman.html?arcade=1` in a same-origin iframe through `src/arcade/pacman-adapter.ts`. It appends the iframe inside the supplied stage without replacing the outer overlay. The host keeps Back, fullscreen and shared settings; the child keeps its established play controls and pause/help/countdown surfaces. The old site header is hidden only when the page is both embedded and explicitly opted in. Embedded fullscreen buttons and F are forwarded to the host, so fullscreen keeps the host's visible exit control. Resize fits the existing canvas and never replaces the game.

## Two modes

**Global challenge** requests a real server-issued Pac-Man run, then starts a fresh one-player game with that run's seed and exact tick limit. The two-player control is disabled and labelled “1 PLAYER · GLOBAL.” The original engine's rate is 60.60606060606061 Hz and its two-minute limit is 7,272 ticks. The host alone retains the server's run identity; the child never chooses a run ID or submits a score. The outer result dialog owns initials and submission.

**Classic local play** reveals the original child title. Select one or two players there and press **LET’S PLAY**. This extra gesture preserves the original player choice and reliably unlocks audio. Classic results stay local; the host receives the final result only after every selected player has finished. The original standalone page also keeps this behavior.

Every ranked restart, including the child's confirmed restart, requests a new server challenge before creating a new seeded game. A failed challenge request falls back to clearly announced classic local play. The adapter has a bounded handshake timeout and cancels pending starts when disposed. If a tab change, lost focus or modal interrupts challenge preparation, the newly issued game starts explicitly paused instead of starting underneath the interruption.

## Replay and clocks

`src/pacman-host.ts` contains `PacmanRankedSession`, a pure adapter around the original `Game`. It applies `Game.update(TICK_SECONDS)` exactly once per simulated tick from its own accumulator, checking after every tick for the first `game-over` frame or the 7,272-tick limit. A long rendering frame cannot advance beyond the valid terminal frame. It never drains engine events; the original UI remains their sole consumer.

An accepted `move(direction)` calls the session's input path, which calls the original `Game.input(direction)` and records cardinal axes at the current `Game.state.frame`, before the future tick advances. Aim axes and buttons are zero. The shared `ReplayRecorder` coalesces all input changes at one frame to the latest accepted direction and stores changes only. Pausing clears fractional presentation time while preserving the engine's latest queued turn. Turns queued during the original three-second resume countdown remain attached to the upcoming engine frame. Ranked completion freezes the engine clock and delivers one exact snapshot; repeated animation frames cannot post it twice.

Classic games continue through their original `Game.update(delta)` path, so ranked constraints do not alter standalone classic behavior.

## Bridge boundary and cleanup

Messages use the `afterhours:pacman:v1` channel and an explicit same-origin `targetOrigin`. Both directions validate `event.origin` and `event.source`. Host-issued monotonically increasing session numbers reject messages from previous runs, and the host attaches its stored server challenge to a valid result rather than trusting identifiers from the child. Result/HUD shapes are checked before display; the actual API independently validates and replays the score.

The adapter removes its message, blur, visibility and iframe-load listeners, settles pending readiness promises, clears its timeout and removes the iframe on disposal. The child cancels its main animation frame, aborts bridge listeners and destroys its audio context. Removing the iframe then releases its browsing context and the original UI/view listeners with it.

Shared mute, reduced motion and high contrast are applied through the original settings functions and persisted under the original keys. Audio still respects browser activation policies: a parent start worked in the tested Chromium configuration with delegated autoplay, and a genuine child pointer/key gesture also attempts unlock for browsers that require it.

## Validation

Run `npx vitest run tests/pacman-bridge*.test.ts` and `npx tsc --noEmit`.

The 15 bridge tests exercise actual server `validateReplay`/`replayScore`, seeded parity, exact first-terminal-frame handling, accumulator caps, event ownership, input-frame mapping and coalescing, paused/countdown turns, fresh session state, same-origin/source checks, stale and duplicate result rejection, host-owned run identities, restart issuance, timeout/disposal and preparation interruption. A legal-input survival controller also completes all 7,272 frames, reaches level 2 and matches the server's 6,710-point replay result. The original 120 engine/experience/mesh regression tests also pass.

Real Chromium checks covered the host/child introduction, actual API-issued ranked one-player start, pause freeze, Resume toolbar state, three-second countdown, queued input, portrait resize without reset, exact child/server score parity, and standalone two-player startup without page errors. A second pass checked embedded classic player selection, alternating players, no premature result after player one's final life, the final local result with a null ranked identity, settings mirroring, native help and iframe removal. A delayed real API request interrupted by settings left the newly seeded child paused at frame zero, including after settings closed. After the development proxy's Origin handling was fixed, the ranked pass succeeded through the natural browser request path without any API fixture. Browser diagnostics and screenshots live outside the repository under `/tmp/pacman-bridge-natural-browser.mjs`, `/tmp/pacman-classic-browser.mjs`, `/tmp/pacman-preparation-browser.mjs` and `/tmp/pacman-embedded-{desktop,mobile}.png`.
