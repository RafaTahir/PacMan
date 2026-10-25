# Chrome Siege

Pilot an armed hovercraft through five 12-second assaults, collect enemy cores to evolve the cannon, then destroy the Siege Engine before the two-minute clock expires. Every game mechanic runs in a seeded, render-independent simulation at 60 Hz. Guests can play the complete game.

## Controls and combat

- Move with WASD/arrows or the left touch stick. Diagonal movement is normalized.
- Aim with the mouse or right touch stick. Aim axes are signed integer **directions**, not world coordinates; zero aim preserves the previous direction. `view.aimAt()` raycasts the ground and returns a quantized direction from the craft.
- Hold primary to fire. The turret aims independently of the hull.
- Press secondary to dash in the movement direction, or aim direction when stationary. Dash travels for 16 ticks and protects the entire movement, including its final tick. The initial cooldown is 144 ticks (2.4s), reduced to 120 ticks at level 4. A fresh press is required. The orbiting white notch and HUD show recharge; cyan ring means ready.
- A damaging hit grants 84 ticks (1.4s) of protection. The steady cyan hull ring shows protection without rapid flashing.

## Enemies and encounter progression

Spawns use a seeded generator and appear around the arena edge with a 42-tick warning. New enemies cannot attack or be damaged until their warning ends. Waves 1–5 begin at 0, 12, 24, 36, and 48 seconds. Spawn rate rises from one enemy per 91 ticks to one per 43 ticks, with occasional paired drones in the final waves.

| Enemy | Hull | Behavior | Readable warning |
| --- | ---: | --- | --- |
| Drone | 12 | Seeks the player with a weaving approach | Pink diamond body and wing strips |
| Gunner | 24 | Orbits at 5–7 units; retreats if approached | Locks a shot direction 26 ticks before firing a pink round |
| Brute | 54 | Slowly approaches, then charges 4.75 units | Stops for a 36-tick lane warning before a 25-tick charge |
| Siege Engine | 840 | Sweeps the north side, cycles aimed fans, gap rings, and parallel volleys | 120-tick entrance, attack lane/ring tells, visible hull bar |

At 60 seconds the existing mob and hostile bullets clear for the Siege Engine entrance. Limited support enemies arrive every seven seconds. The boss changes phase below two-thirds and one-third hull, increasing fan/ring density, bullet speed, and attack frequency. Each transition clears old hostile rounds and grants a 75-tick attack respite. Ring attacks leave a generous rotating sector open. Defeating the boss immediately wins; losing all hull or reaching tick 7200 loses. Terminal simulation states freeze completely.

## Upgrades and pickups

Every drone drops a 3-core crystal, gunner 4, and brute 7. Crystals magnetize toward nearby players; attraction range increases with level. Every eighth kill also drops a white repair cross worth two hull. Cores and repairs expire after 20 seconds. Crossing a core threshold automatically upgrades without pausing the replay:

| Level | Cannon | Other benefits |
| --- | --- | --- |
| 1 | Single pulse, 6 damage, 10-tick interval | 6 hull |
| 2 | 7 damage, 9-tick interval | +1 maximum hull |
| 3 | Three-shot spread, 8 damage per round | Wider coverage |
| 4 | 9 damage, 8-tick interval | 2-second dash; +1 maximum hull |
| 5 | Five-shot spread, 10 damage per round | Broad close-range fire |
| 6–8 | 11–13 damage, 7-tick interval | Maximum hull reaches 9 |

Every upgrade heals one hull and awards `250 × new level`. The initial threshold is 8 cores; subsequent thresholds are `8 + current level × 5`. The level cap is 8. The model consolidates old crystals if the pickup pool fills, preserving their core value.

Kills score 100 / 160 / 280 for drones / gunners / brutes, and 10,000 for the boss. Every five consecutive kills increases the multiplier by one, up to ×5. A hit or 210 ticks without a kill resets the chain. Victory adds two points per remaining tick and 500 per remaining hull.

## Rendering and accessibility

Three.js builds the arena, craft, turret, thrusters, enemy silhouettes, boss, bullet shapes, pickups, lights, and warnings procedurally. The slight-tilt orthographic camera fits the complete arena on every resize. Shared geometry/materials and ID pools avoid per-frame mesh rebuilding; resources dispose when leaving the game. The view uses no external assets or postprocessing. Reduced motion removes hover bobbing and decorative rotation. High contrast strengthens floor guides, warnings, and hostile projectile sizes. Color is reinforced with distinct shapes, warning lanes, hull rings, and text HUD.

## Verification and limits

`npx vitest run tests/chrome-siege.test.ts` covers directional aiming, normalized movement, live projectile kills, dash/grace timing, contact damage, gunner and brute tell locking, actual core/repair upgrades, cannon tiers, combo scores, timed waves, boss phases and victory, terminal freeze/reset, exact 7200-tick cap, full-stream deterministic replay, entity bounds, and an unmodified ordinary-input pilot that defeats the boss before the deadline. A headless Three scene test verifies complete arena framing in portrait and landscape, ground-ray pointer direction, and scene cleanup.

Maximum live pools: 32 enemies, 64 player rounds, 112 hostile rounds, 64 pickups, and 48 short effects. Segment collision prevents tunnelling. Both rendering and tests use the same pure `createSimulation(seed)` implementation as replay verification. The model imports no DOM, wall clock, rendering code, or unseeded randomness.
