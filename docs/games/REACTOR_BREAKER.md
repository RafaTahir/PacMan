# REACTOR BREAKER

A two-minute reactor demolition shift. Clear three sectors of stacked towers using one energy ball and a responsive paddle. Every tower is a physical stack of one to four mesh casings, and each sector adds stronger stacks and a faster ball.

## Playing

- Move with **A/D**, **left/right**, or a pointer/touch drag. Pointer input supplies an absolute paddle target; movement remains bounded rather than teleporting.
- **LAUNCH** serves a ball after the initial start, a lost core, or a sector change. Holding it automatically serves when ready.
- Paddle center returns the ball vertically. Paddle edges produce progressively steeper angles; moving the paddle adds a small, predictable amount of spin.
- Hold **PULSE**, then release after at least eight ticks to arm the next tower impact. A basic pulse costs 30 energy, deals three damage, and blasts nearby stacks. Holding at least 42 ticks with 55 energy arms a larger, four-damage mega pulse. A full one-second hold arms automatically. Pulses expire after eight seconds; capacitor towers and ordinary layer breaks refill energy.
- Cyan diamond towers are ordinary cores. Steel towers with three stripes take two hits per layer. Orange crossed towers explode when their last layer breaks, damaging neighboring stacks and continuing chains. Lime concentric-ring capacitors provide energy and a falling upgrade.
- Catch purple wide-paddle pickups (15 seconds), pale multiball pickups (up to three balls), and cyan safety-field pickups. A lit field catches one missed ball. Each sector restores one field charge, up to two. A life is spent only when every ball drains. Three lives begin each run.

Layer destruction increases a short-lived combo up to a 5× multiplier. Chains, catches, sector clears, remaining lives, and a quick final clear add points. The shift ends at exactly 7,200 simulation ticks. All leaderboard and initials behavior is provided by the shared arcade shell.

## Implementation

`model.ts` exports `createSimulation(seed)` and typed inspectable state. It consumes only clamped integer inputs and a seeded generator. No rendering, clocks, DOM, storage, or unseeded randomness affect replay. Circle/rectangle collision checks solve swept flat faces and exact rounded corners; the remaining tick interval is processed after each contact, avoiding high-speed tunneling. Paddle returns are angle controlled and preserve the current stage speed.

There are at most 28 towers, three balls, five drops, 144 fragments, 16 expanding blast rings, and 32 sound/game signals per tick. Volatile destruction queues each tower once. Scores cap at 9,999,999, and finished simulations are immutable under further `step` calls.

`view.ts` builds a procedural Three.js reactor deck with real stacked casings, front vents, separate cap glyphs, paddle, balls, pickups, rails, a safety field, shadows, and fragment meshes. Reused geometry and instanced tower/particle batches avoid per-frame mesh creation. A stable tilted orthographic camera always fits the entire board; pointer aim is ray-projected onto the board. Reduced motion removes debris, trails, bobbing, and pickup rotation. High contrast brightens tower colors and floor markings while the four tower types retain distinct glyphs. Disposal releases every owned geometry, material, texture, and instance buffer and removes the view group.

## Verification

Run `npx vitest run tests/reactor-breaker.test.ts`. The 21 cases cover exact corner and face sweeps, overlap escape, high-speed stack collisions, wall corners, paddle angles and spin, armor layers, recursive chains, pulse charge/release, all pickups, field catches, life/serve resets, multiball survival, escalating stages, victory, run reset, the exact time cap, a complete 7,200-input deterministic replay, a legal-input three-sector victory, and explosive-yard resource bounds.

Chromium/WebGL visual inspection verified desktop and 540×900 portrait fits, pointer projection to both paddle limits, contrast and motion options, and clean disposal. The initial board rendered in 43 draw calls with 5,278 triangles. After repeated live updates the view remained at 49 uploaded geometries; disposal returned the shared renderer to zero geometry allocations and zero draw calls. The renderer retains its own internal texture until stage disposal. This is a software-rendered headless check, not a hardware performance claim.
