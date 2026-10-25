# Neon Rally

A complete, seeded two-minute expressway survival race, built for the shared After Hours Arcade shell. All cars, buildings, road furniture, signs, textures and effects are original procedural assets. The road is a readable driving plane with actual Three.js car bodies, glass cabins, wheels, cargo trucks, raised barriers and a streamed neon city.

## Play

- Steer with **A/D**, **left/right**, or the mobile stick. The car accelerates automatically; **up/W** adds speed and **down/S** slows it.
- Hold **NITRO / primary** to spend energy for a substantial speed boost. Boosting makes a close pass more valuable and a collision more damaging. An empty tank locks until released or recharged sufficiently.
- Hold **DRIFT / secondary** while turning to reduce grip and brake into a slide. Release after a controlled slide to bank drift points and refill nitro. Momentum continues after the button is released, so straighten the car before reaching the guardrail.
- Overtake traffic with less than **0.95 m** of clearance to earn a close pass. Less than **0.25 m** earns a dangerous pass. The five-second chain timer refreshes on each close pass; every third pass raises the multiplier, up to **×8**. A collision breaks the chain. Drifting can briefly extend a live chain.
- Avoid vans, long trucks, weaving motorcycles, roadwork barriers, cones and purple oil slicks. Oil reduces grip and breaks the chain without secretly damaging armor.
- Collect glowing green **repair crosses** for **22 armor**, **35 nitro** and **100 points**. Passing each 30-second district checkpoint restores **18 armor**, adds **22 nitro**, and awards a checkpoint bonus.
- You have **three cars**, each with **100 armor**. Losing a car grants a recovery window. Survive the full **2:00** to reach the final bridge and earn a finish bonus; losing the last car ends the run immediately. The shared shell handles results, replay, initials and verified leaderboards.

## Scoring

Distance earns 1.6 points per metre and each clean traffic overtake earns 25 points. A normal close pass earns 140 points; a dangerous pass earns 230. Add 100 while boosting or 60 while drifting, then apply the chain multiplier. Controlled drifts bank approximately 100 points per charged second, multiplied by the current chain. District bonuses are 500, 1,000 and 1,500 points. A successful finish awards 1,000 points plus 300 per remaining car and 15 per remaining armor point. The score ceiling is 999,999.

Traffic waves become denser and the automatic target speed rises across **Lower Grid**, **Glass Quarter**, **Afterlight** and **Final Bridge**. Every wave deliberately leaves an empty lane, and its opening moves no more than one lane between waves. Relative vehicle speeds, sizes and lateral movement create different passing opportunities. Guardrails prevent leaving the road and cost armor when struck.

## Deterministic integration

`model.ts` exports `createSimulation(seed)` and implements the authoritative shared `ArcadeSimulation` contract. Every `step(input)` advances exactly one 60 Hz tick. Integer axes are normalized through the shared helper; primary is nitro and secondary is the handbrake. There is no DOM, rendering, wall clock, network access or unseeded randomness in the simulation. The xorshift state, spawn timers, entity state, effects, score remainder and progression live in `RallyState`. Traffic uses an arithmetic triangle wave rather than trigonometry. A run freezes after `gameover` or `victory`, and tick 7,200 is the latest possible finish.

Entity lists are capped at 44 and effect lists at 36. Clean passing is judged from minimum physical edge clearance while the vehicles overlap longitudinally, then awarded once after the overtake. A hit vehicle cannot also earn a close-pass reward. Damage has invulnerability and recovery periods; collected repairs cannot reactivate a terminal run. `makeEntity` exposes the same dimensions used by collision detection so tests can arrange physical scenarios without bypassing the actual update path.

`index.ts` exports the default `GameDefinition` plus the simulation factory. Its HUD reports speed, cars/armor, nitro, chain/multiplier, countdown, district, distance and route progress. `view.ts` consumes state without advancing it, interpolates previous positions, fits the road on portrait and landscape screens, and disposes its owned instanced buffers, geometries, materials and textures. It uses approximately 50 draw calls and 18,000 triangles in a representative traffic scene, with shared geometry, bounded instancing, no downloaded assets, no shadows and no bloom pass.

Reduced motion removes recovery blinking, boost streaks, pickup bobbing/spinning and most particles. High contrast brightens lane boundaries, traffic and windows and removes distance fog. Both modes retain all gameplay information.

## Validation

Run `npx vitest run tests/neon-rally.test.ts` and `npx tsc --noEmit`.

The 14 tests cover steering inertia and damping; changed drift grip, braking and banking; nitro consumption and empty-tank locking; guardrail damage; input normalization; real close overtakes, single awards and multiplier chains; collision and recovery rules; final-car failure and terminal freezing; oil and repair behavior; district checkpoints and timer expiry; factory reset and seed variation; score limits; a full successful race using ordinary controls and damage rules; and two identical full 7,200-tick replays with bounded entities/effects and every traffic tier. Chromium checks exercise desktop, 430 × 780 portrait, reduced motion, high contrast and cleanup on the real shared ThreeStage without browser errors.
