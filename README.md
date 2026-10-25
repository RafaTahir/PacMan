# After Hours Arcade

Five browser cabinets in one neon arcade: the preserved Pac-Man tribute, Neon Rally, Reactor Breaker, Chrome Siege and Midnight Pinball. The four new games use original procedural Three.js meshes over readable playfields, deterministic simulations and keyboard/pointer/touch controls.

The home page displays **real global, persistent, per-game leaderboards**. All time is the default; Today (UTC) is optional. Accepted records live in D1 independently of browsers and deployments. No competitor scores are seeded. Service failures show an honest error or an explicitly local practice run.

| Cabinet | Complete game loop | Notes |
| --- | --- | --- |
| Pac-Man | Original maze/ghosts, lives, fruit, levels and alternating classic players; optional two-minute ranked challenge | [Fidelity](docs/FIDELITY.md), [ranked adapter](docs/PACMAN_EMBED.md) |
| Neon Rally | Steering inertia, drift, nitro, traffic, close-pass chains, damage and district checkpoints | [Rules](docs/games/NEON_RALLY.md) |
| Reactor Breaker | Aimed paddle, stacked towers, armor, charged pulses, explosive chains, upgrades and three sectors | [Rules](docs/games/REACTOR_BREAKER.md) |
| Chrome Siege | Twin-stick waves, distinct enemies, dash protection, pickups, upgrades and a three-phase boss | [Rules](docs/games/CHROME_SIEGE.md) |
| Midnight Pinball | Powered flippers, plunger, bumpers, three balls, elevated ramp, earned multiball and jackpots | [Physics/rules](docs/games/MIDNIGHT_PINBALL.md) |

## Run locally

Use Node.js 24 and npm. Local play/D1 need no cloud credentials or asset downloads.

```sh
npm ci
npm run build
npm run db:migrate:local
npm run dev:api
```

Keep the Worker running, then use a second terminal:

```sh
npm run dev -- --port 5173 --strictPort
```

Vite forwards `/api` to the local Worker on 8787. The Worker serves production `dist/` assets and APIs on 8787. `npm run preview` serves static files only. Local D1 persists under ignored `.wrangler/state`; never delete it to refresh a build.

For the managed cloud sandbox:

```sh
npm ci --cache /workspace/.cache/pacman-npm --no-audit --no-fund
mkdir -p /workspace/.cache/after-hours-xdg
XDG_CONFIG_HOME=/workspace/.cache/after-hours-xdg \
WRANGLER_LOG_PATH=/workspace/.cache/after-hours-wrangler.log \
WRANGLER_SEND_METRICS=false npm run db:migrate:local
```

Use the same environment assignments with `npm run dev:api`. Optional development `Request.cf` metadata may be unavailable; the local game/API do not require it.

## Play

Select a cabinet, then choose a server-issued ranked run or local practice. Ranked runs last up to two minutes. Classic Pac-Man remains available with its native one/two-player title and full level progression.

Controls are shown for the current input mode; Help contains full instructions. Rally has steering/nitro/drift; Reactor supports paddle dragging; Siege uses movement plus mouse/right-stick aiming; Pinball uses Z and `/` for flippers and hold/release Space to launch. Touch controls remain outside the playfield. P pauses, M changes sound, and F toggles fullscreen. Failure to enter fullscreen retains the expanded page layout.

Menus, backgrounding and context loss freeze the simulation. Resume gives a cancellable three-second countdown. Switching an active run asks before ending it and releases render/input/audio resources. Mute, reduced motion, contrast, initials and local bests persist defensively. Existing Pac-Man settings and personal best are retained.

WebGL restoration rebuilds new-game views over the same simulation and requires deliberate resume. New games show an explicit unavailable message without WebGL 2; Pac-Man retains its labelled Canvas 2D fallback. The visual games are not complete screen-reader gameplay interfaces.

## Real rankings and initials

After a ranked run, enter exactly three A–Z initials. They are public labels, not unique identities or accounts; duplicates are allowed. No passwords, email or profile ownership are claimed. **Google sign-in is not implemented in this Sites build.** There is no fake login or custom OAuth workaround. All five main games are open to guests.

The Worker derives the score by replaying the actual seeded model. It validates tickets, durations, input ranges/order, claimed scores and body limits. Leased claims, atomic writes and a unique run constraint prevent duplicate entries and recover transient failures. Matching accepted retries return the existing result. Moderation, rate limits and bounded verification reduce abuse. Replay validation does not prove human play or prevent tool-assisted legal inputs. [API/security notes](docs/LEADERBOARDS.md) explain those limits.

Local practice/device bests are separate. Accepted all-time scores have no automatic expiry; daily queries never delete them. Migrations contain schema only, never test competitor data.

## Verify

```sh
npm test
npm run build
ARCADE_PRODUCTION_URL=http://127.0.0.1:8787 \
ARCADE_API_URL=http://127.0.0.1:8787 \
python3 tests/arcade_smoke.py http://127.0.0.1:5173
```

Browser tests require Python Playwright and `/usr/bin/chromium` or `CHROMIUM_PATH`; both are in the prepared cloud environment. They exercise ordinary controls, real indexed GPU geometry, touch, fullscreen, cleanup and real cross-context D1 persistence. Rare states are labelled fixtures; acceptance includes a naturally completed production replay.

Preserved Pac-Man suites use its own page:

```sh
python3 tests/browser_smoke.py http://127.0.0.1:5173/pacman.html
python3 tests/fullscreen_smoke.py http://127.0.0.1:5173/pacman.html
GRAPHICS_PRODUCTION_URL=http://127.0.0.1:8787/pacman.html \
python3 tests/graphics_smoke.py http://127.0.0.1:5173/pacman.html
EXPERIENCE_PRODUCTION_URL=http://127.0.0.1:8787/pacman.html \
python3 tests/experience_smoke.py http://127.0.0.1:5173/pacman.html
```

Reports go under ignored `test-results/`. [Arcade validation](docs/ARCADE_VALIDATION.md) records evidence and limits. Headless Chromium/SwiftShader and emulated viewports do not certify physical phones or universal 60fps.

## Existing Sites deployment

- `dist/`: landing page, lazy game bundles and self-contained classic `pacman.html`.
- `build/worker.mjs`: portable Worker ESM from `server/index.ts`.
- `.openai/hosting.json`: existing project ID, logical D1 binding `DB`, `r2:null`.
- `drizzle/`: immutable schema migrations and generated snapshot/journal. Apply pending migrations to the existing DB before Worker upload; never reset accepted rows or issue request-time DDL.
- `wrangler.jsonc`: local tooling with an explicitly non-deployable placeholder DB ID; do not publish it to an unrelated Cloudflare account.

The coordinating Sites publisher owns the supported adapter, existing project/audience and publication. Build/tests/source push do not establish a new public release. [Architecture](docs/ARCADE_ARCHITECTURE.md) documents the boundaries.

Pac-Man remains an independent fan tribute with documented arcade differences. New games use original procedural art, geometry and synthesized audio, without model packs or protected game assets.

Runtime framework attribution: [Third-party notices](THIRD_PARTY_NOTICES.md), also distributed as `dist/THIRD_PARTY_NOTICES.txt`.
