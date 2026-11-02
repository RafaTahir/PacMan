# 06 — Orbit Salvage: Recovery Rig

## Three reviewed comparables

- **Super Stardust Delta** — [Push Square, Corbie Dillard, 11 March 2012, 9/10](https://www.pushsquare.com/reviews/psnvita/super_stardust_delta). Responsive twin-stick asteroid combat, differentiated materials and readable effects inform a richer salvage field.
- **Luftrausers** — [Push Square, Kell Andersen, 18 March 2014, 8/10](https://www.pushsquare.com/reviews/psn/luftrausers). Momentum mastery and offensive/defensive trade-offs inform cargo mass and shield-powered recovery.
- **Asteroids: Recharged** — [TouchArcade, Shaun Musgrave, 15 December 2021, 4/5](https://toucharcade.com/2021/12/15/switcharcade-round-up-reviews-featuring-asteroids-recharged-and-clockwork-aquario-plus-news-sales-and-new-releases/). Its positively reviewed modern asteroid score attack informs short-run clarity. Wider critical reception was mixed, so this is a selected positive reference, not a consensus ranking.

Supplementary progression research: **Nova Drift**, [Polygon, Christian Donlan, 5 October 2024, positive unscored impressions](https://www.polygon.com/impressions/458387/nova-drift-impressions-vampire-survivors/). Interacting ship upgrades inform fitted modules. Primary indexed text was inspected; direct page opening failed. This is labelled impressions, not a scored review. No inaccessible Hardcore Gamer score is asserted.

## Original implementation

A drifting industrial wreck appears on a deterministic schedule. Hold shield near it to couple a physical spring/damped tow; release or exhaust shield to detach. A wrap boundary also detaches explicitly, avoiding an artificial cross-field pull. Return ship and wreck slowly to the refinery for four banked ore and a recovery reward before the signal expires.

Banked ore fits three automatic modules: at six, a wider salvage field and sixteen-unit hold; at twelve, twin cannon barrels and improved cooling; at eighteen, faster shield recharge and hull repair. This is automatic progression, not a configurable build tree. Cargo mass slows acceleration, so full loads affect approach planning. Dense asteroids take an extra hit and yield double ore; volatile ones weaken nearby armor without an unbounded recursive explosion. Composition persists through fragmentation. Excess ore at a full hold remains available instead of vanishing.

Original procedural assets show fitted equipment, distinct rock compositions, the recovery pod and tether, cargo/refinery guidance, and a more detailed industrial station. No downloaded commercial assets are used.

## Acceptance

14 Orbit model tests pass, plus TypeScript. Added checks cover attach/release/depletion, once-only delivery, wrap detachment, signal expiry, module thresholds, twin-shot cap, partial dense-ore pickup, composition effects, finite input normalization and measurable cargo mass. Existing deterministic replay, fragmentation, shield, heat and terminal behavior checks pass. At this milestone the full suite has **415 tests across 22 files passing** (prior to final remaining cabinets).

## Limits

The reference ship-build diversity, security enemies, campaigns and spherical fields are not reproduced. There is one field with three compositions and a timed delivery contract. Wreck towing explicitly detaches at the wrap edge; no cross-boundary tether is simulated. Headless Chromium rendered explicit rig/tow/composition fixtures at 1280×900 and 390×844 without page errors or horizontal overflow (approximately 80 draws / 6,344 triangles in the fixture). This is software/headless evidence, not hardware performance certification. Final release integration checks remain.
