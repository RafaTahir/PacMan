# Architecture

The existing project hosts ten cabinets. HTML/CSS/TypeScript supply the home, real rankings and common shell. The featured carousel selects a cabinet and its neighbors in a static Three.js scene without an idle render loop. Rotation pauses for focus, hover, background pages, reduced motion, or its explicit pause button. Only the chosen game is mounted; game modules are lazy-loaded and share Three.js. Render resolution and effect/entity pools are bounded.

## Deterministic simulation

Each new game implements the shared ArcadeSimulation contract: seeded, DOM-free, fixed 60 Hz steps. Rendering never advances its clock/RNG. Quantized axes/button flags are recorded only when they change, at exact simulation ticks. Same-tick intermediate inputs coalesce. Models stop at terminal states or 7,200 ticks; local practice uses the same arcade mechanics without a ranked ticket. Per-game notes disclose physics/rules approximations.

One controller owns its RAF/stage/listeners. Menus, blur, hidden pages and context loss stop updates. A cancellable 3s resume gate accepts intentional input while the model stays still. An asynchronous seed response cannot start a preparation interrupted by focus loss or a menu. Switching disposes old resources before mounting another cabinet.

## Preserved Pac-Man

pacman.html retains the existing UI, original 60.606 Hz engine, maze, tables, WebGL actors and audio. Classic keeps its original one/two-player title, independent boards, lives and progression. An optional single-player 2min ranked adapter records cardinal inputs at actual engine frames, advances original ticks individually, and stops at first terminal or 7,272 frames. Server verification imports that same Game implementation.

Same-origin/source validation and per-start nonces reject stale iframe results. Explicit messages own pause/settings/help/fullscreen/disposal; results emit once. A separate esbuild bundle preserves offline classic HTML without relative Vite-chunk imports. See PACMAN_EMBED.md and FIDELITY.md.

## 3D, recovery and accessibility

New views use real indexed/depth-tested meshes, original procedural geometry, lighting and inexpensive effects. Resize/fullscreen/orientation fit full playfields. Context loss preserves simulation/replay/ticket, disposes the old view while the context is lost, then builds a fresh view after native restoration and requires deliberate resume. This avoids stale pre-loss GPU disposal handles.

Mute/motion/contrast/device bests persist defensively, including legacy Pac-Man defaults. Play actions have 44×44 CSS-pixel targets. Native dialogs own focus; input-specific hints stay concise, with full controls in Help. Missing WebGL 2 is explicit; only Pac-Man has a labelled 2D fallback. Visual gameplay is not a full screen-reader interface.

## Worker and permanent D1

Worker ESM routes same-origin APIs and serves assets through ASSETS. D1 binding DB stores tickets, scores, rate counters and service settings. All time is primary; Today (UTC) queries the same permanent records. Visible-page polling every 15s provides near-real-time refresh, not a WebSocket claim.

The server issues cryptographic run IDs/seeds, validates replay/time/body/score bounds and derives results by replay. Leased token claims, transactions and a unique run/score constraint prevent duplicate rows and recover D1 faults. Identical accepted retries return the persisted result; conflicting retries cannot rewrite it. Exact finish rank is bounded to the top 100; other accepted scores retain their permanent record without an invented rank.

Schema-only Drizzle migrations are append-only. Never rewrite applied migrations, reset accepted records or run CREATE/ALTER in requests. Accepted scores/tickets have no TTL; cleanup targets only unaccepted tickets and rate metadata. LEADERBOARDS.md records APIs, moderation, retained data and resource limits.

## Identity and delivery boundaries

Guest initials are three-letter public labels, not authenticated identity; duplicates are allowed. No client user ID/email is trusted. Google sign-in is unavailable in this Sites build; no custom OAuth/session service or fake provider is scaffolded. Replay checking cannot establish human play or prevent automated search over legal inputs. Rate/request/model bounds do not certify production CPU/D1 quotas or defeat distributed denial of service.

The existing Sites project appgprj_6add9f91d5088191b2397efdda9c3663 declares d1:'DB',r2:null. Assets are dist/ and portable Worker bundle build/worker.mjs. The coordinating publisher uses the supported Sites adapter, preserves audience/database, applies pending migrations then uploads Worker. No new Site or separate Cloudflare account is required. Local validation, Git source publication and public deployment remain separate.

## Ten-cabinet storage extension

Migration 0002 adds cabinet_runs/cabinet_scores for the five added IDs. Existing runs/scores, constraints, indexes and foreign keys are untouched. Fixed whitelisted storage routing applies the same claim, replay, duplicate and retention behavior to both namespaces. Apply 0002 before uploading the Worker. Ruleset v2 covers the new pinball river route; accepted v1 history remains readable and idempotently retriable, while stale unaccepted v1 tickets receive ruleset_mismatch.
