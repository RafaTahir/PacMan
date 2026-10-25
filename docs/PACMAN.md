# Pac-Man · After Hours

The preserved classic is at `/pacman.html`; use the root README for shared arcade/API setup.

A browser arcade tribute with the original maze, researched ghost behavior, keyboard and touch controls, and genuine lightweight 3D characters and pellets over a flat maze. Indexed WebGL geometry gives Pac-Man a solid animated mouth, gives ghosts rounded bodies and eyes, and lights spherical pellets. The maze and HUD remain Canvas 2D. TypeScript, WebGL, Canvas 2D, Web Audio, and Vite; no runtime framework, model downloads, or additional runtime dependency.

Choose one player or two alternating players. Each player keeps an independent maze, level, score, and lives. Clear all 244 dots and energizers, collect the fruit, and chase the best score saved in your browser. Games begin with three lives and award one extra life at 10,000 points.

## Run

Use Node.js 20.19+, 22.12+, or a newer supported release and npm. Node 24 is available in the prepared workspace.

```sh
cd /workspace/PacMan
npm ci --cache /workspace/.cache/pacman-npm
npm run dev
```

The explicit cache path suits this sandbox's writable directories. In a normal checkout, run `npm ci` from the project directory. The development server uses port 5173 by default. No credentials or backend service are required.

```sh
npm test           # Engine and rule regression tests
npm run build     # TypeScript check and production build in dist/
npm run preview   # Serve the production build locally
```

The build also creates **`dist/pacman.html`**, a self-contained edition with all code, artwork, styles, and synthesized audio included. Save that file and open it in a modern browser for offline play. No external fonts, images, scripts, or game services are required. The ordinary `dist/index.html` build remains available for static hosting.

The browser smoke checks require Python Playwright, Chromium, and a running development server:

```sh
python3 tests/browser_smoke.py
python3 tests/fullscreen_smoke.py
python3 tests/graphics_smoke.py
python3 tests/experience_smoke.py
```

Browser tooling is separate from the npm dependencies; the prepared cloud environment supplies it. The scripts default to port 5173 and `/usr/bin/chromium`; pass a server URL as the first argument or set `CHROMIUM_PATH` for another Chromium installation. Screenshots and JSON reports go in the ignored `test-results/` directory. Deployment is managed separately from local building and testing.

The graphics suite verifies actual indexed, nonplanar mesh buffers, WebGL draw calls and rendered pixels, actor states, pellet removal, mobile/fullscreen behavior, context loss/restoration, and the explicit 2D fallback. To include the production build, start `npm run preview -- --port 4173 --strictPort` and run `GRAPHICS_PRODUCTION_URL=http://127.0.0.1:4173 python3 tests/graphics_smoke.py`.

## Play

| Action                       | Control                                   |
| ---------------------------- | ----------------------------------------- |
| Move and queue the next turn | Arrow keys or W A S D                     |
| Pause / resume               | P (Escape also pauses in cabinet view)    |
| Toggle sound                 | M                                         |
| Enter / exit fullscreen      | Fullscreen button or F                    |
| Large / cabinet view         | View button or V                          |
| Leave an expanded view       | Escape                                    |
| Start / replay               | The start button or Enter                 |
| Touch movement               | Swipe the maze or use the on-screen D-pad |

Switching tabs or losing window focus pauses the game; resume deliberately when you return. Returning to active play gives a cancellable three-second countdown. Queue a direction while the maze is still; the newest request wins. Restart asks before ending the current run. Sound begins after a user gesture. The personal best, sound, motion, play cues, contrast and view preferences are stored locally when browser storage is available; games remain playable if storage is unavailable. Runs are not saved across reloads.

Optional play cues show a queued direction and the engine's actual frightened time, with a static expiry warning that works when muted or using reduced motion. Only blue, frightened ghosts are edible; eyes and revived normal ghosts remain distinct. Brief first-use tips appear while the maze is already still. The help menu includes play-cue, higher-contrast and motion settings; interactive targets are at least 44×44 CSS pixels. [The experience notes](EXPERIENCE.md) explain the research and scope.

Large view is the default and fits the complete maze and HUD to the available viewport. Native fullscreen starts only from a button click or keyboard gesture, with an always-visible exit. If the browser rejects or does not support fullscreen, the game expands within the page instead. The view preference is saved locally, and resizing, rotating, or changing views keeps the current game intact.

The title screen runs an automated demonstration. Short, independently drawn intermissions appear after boards 2, 5, 9, 13, and 17. Reduced motion respects the system preference on first use and can be changed in the interface.

The footer displays **3D** when WebGL mesh graphics are active. If WebGL is unavailable or its context is lost, it explicitly displays **2D fallback** and keeps the same game running. Context restoration returns to 3D. Raster resolution adapts on slow renderers; the maze stays sharp and the actual 3D geometry and arcade simulation remain unchanged. Fruit icons, HUD artwork, and intermissions use the original project’s 2D drawing code.

Menus, buttons, dialogs, status announcements, and keyboard focus have accessibility support. The moving canvas maze remains primarily visual; this is not a complete screen-reader gameplay interface.

## Rules and fidelity

The game implements the four targeting personalities, Pinky/Inky's upward-targeting quirk, scatter/chase schedules, frightened behavior, house-release counters, Cruise Elroy, tunnel slowdown, fruit progression, and tile-based collisions. The rendering and sound are original interpretations. Floating-point movement and a replacement random generator mean original arcade patterns are not guaranteed to work. Play continues beyond board 255 without reproducing the split-screen corruption.

See [the fidelity checklist](FIDELITY.md) for implemented behavior and known differences, and [the research notes](RESEARCH.md) for source citations and complete level tables.

## Project map

| File                                         | Purpose                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| `src/engine.ts`                              | Fixed-step simulation, actors, scoring, and state transitions |
| `src/levels.ts`, `src/maze.ts`               | Level rules and maze data                                     |
| `src/renderer.ts`, `src/intermission.ts`     | Canvas artwork and intermissions                              |
| `src/mesh-renderer.ts`, `src/mesh-geometry.ts` | Indexed WebGL assets, shaders, batching, and recovery          |
| `src/audio.ts`                               | Synthesized effects and background sound                      |
| `src/experience.ts`                          | Presentation-only resume clock and factual play cues          |
| `src/main.ts`, `src/style.css`, `index.html` | Controls, menus, persistence, and responsive layout           |
| `tests/engine.test.ts`                       | Behavioral regression tests                                   |
| `tests/browser_smoke.py`                     | Browser interaction and rendering checks                      |
| `tests/mesh-geometry.test.ts`, `tests/graphics_smoke.py` | Solid geometry invariants and actual WebGL browser checks |

PAC-MAN is a trademark of Bandai Namco Entertainment. This independent fan tribute is not affiliated with or endorsed by the rights holder. Code, artwork, and synthesized sounds were written for this project; arcade ROMs and extracted assets are not included. This statement grants no rights to third-party trademarks or characters.
