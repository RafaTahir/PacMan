# Ten-cabinet release

All main cabinets remain available to guests. Three-letter initials label real replay-checked global scores; they do not create accounts. Existing public Site identity, URL and audience are preserved by the publisher.

## Games

- **Pac-Man:** preserved arcade engine and mesh characters, with restrained new mesh rim lighting.
- **Neon Rally:** unchanged driving rules; new exterior city pylons and lamps.
- **Reactor Breaker:** unchanged paddle/chain physics; new containment couplings and reactor fixtures.
- **Chrome Siege:** unchanged combat rules; new floor traces, pylons and power cells.
- **Midnight Pinball:** Malaysian tropical table, hibiscus bumpers, palms, lanterns, batik-inspired deck and market roof. A second physical elevated river route joins the left ramp, with rollback, Island Tour objective and multiball jackpots.
- **Orbit Salvage:** inertia, asteroid splitting, cannon heat, shields, collectible ore and refinery contracts.
- **Tidal Courier:** boat momentum, changing currents, reefs/ferries, six Malaysian dock labels, cargo delivery, brakes, boost and repair streaks. Island positions are a fictional playfield, not a geographic map.
- **Prism Circuit:** seeded solvable 3×3 to 5×5 routing puzzles, tile rotation, undo and live path feedback.
- **Skybound Stack:** original falling-block implementation with mixed three/four/five-cell shapes, wall kicks, ghost landing, row clears, chains and lock delay.
- **Canopy Sprint:** three-lane rainforest runner, jump/slide/dodge obstacles, orchid chains, near misses and increasing pace. Gaps use gameplay collision checks rather than rigid-body holes.

All new models use fixed 60 Hz seeded simulation and bounded two-minute runs. Views use original procedural Three.js meshes. Pause, safe resume, touch cancellation, fullscreen, disposal and graphics recovery use the shared tested controller. Mobile checks emulate touch devices; physical phones remain unverified. These are browser arcade games, not a claim of AAA production scale.

## Home

The featured carousel rotates every seven seconds and launches the selected game. Arrows wrap across all ten; explicit pause, focus/hover and reduced motion stop automatic rotation. A static three-cabinet render updates only when selection or layout changes. All ten cards and per-game all-time rankings remain directly accessible on the landing page.

## Permanent scores and deployment

Append-only migration `0002_additional_cabinets.sql` creates two extension tables without changing existing data or tables. Existing migrations 0000/0001 and their snapshots stay byte-identical. Both namespaces use the same server-issued seeds, deterministic replay, rate limits, claim leases and duplicate protection; no fake competitors are seeded.

Ruleset v2 is required for the changed pinball simulation. Accepted historical scores remain visible and accepted retries remain idempotent. Unaccepted tickets from an older open tab return an explicit ruleset mismatch; start a fresh run after updating.

Build with `npm run build:sites`, then check the actual packaged artifact with `node scripts/smoke-sites.mjs`. Apply the committed pending migration to the existing Sites-provisioned DB before uploading `dist-sites/server/index.js`. Publishing must use the existing project, not a new database or Site. No request-time DDL or score reset occurs.
