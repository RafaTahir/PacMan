# 02 — Neon Rally: Draft and Deliver

## Three reviewed comparables

- **OutRun 2006: Coast 2 Coast** — [VideoGamer, Tom Orry, 9/10](https://www.videogamer.com/reviews/outrun-2006-coast-2-coast-review/). Page exposes an updated date of 6 June 2021, not an original publication date. Praises slipstreaming, drifting and skill challenges. Inspiration: preparation followed by a rewarding clean overtake.
- **Burnout Paradise** — [GameSpot, Alex Navarro, 23 January 2008, 9/10](https://www.gamespot.com/reviews/burnout-paradise-review/1900-6185049/). Varied city objectives make driving purposeful. Inspiration: choose a challenge spatially at a visible gate.
- **Horizon Chase Turbo** — [Nintendo Life, Chris Scullion, 27 November 2018, 9/10](https://www.nintendolife.com/reviews/switch-eshop/horizon_chase_turbo). Praises immediate handling, speed and memorable scenery. Inspiration: legible original district silhouettes and replay goals.

## Original implementation

Follow one vehicle within a 6–19m trailing band and tight lateral alignment for 45 ticks. The target ID locks a four-second opportunity: pass that exact car cleanly for a capped score reward, nitro refill and two seconds of extra speed. A road-plane ribbon and explicit HUD/banner show charge and readiness. Damage, oil, invalid targets and expiry cancel the maneuver; pickups cannot charge it.

Split gates offer a left-side 300-point drift-banking contract or a right-side five-clean-pass contract. The player has twenty seconds; success awards 1500 points and armor, while a miss simply allows another attempt. New authored gantries, glass colonnades, low roof forms, and bridge towers/cables distinguish all four districts. All geometry/materials/textures use the existing disposal registry. Extra speed streaks respect reduced motion; contracts remain text-readable.

## Acceptance

18 Rally tests and TypeScript pass, including unchanged full-race survival/replay/bounded-pool tests. New fixtures verify correct-target slingshots, exactly-once rewards, pickup exclusion, expiry/damage cancellation, both contract choices, success settlement and nonfatal failure. Visual browser verification is reserved for the final release pass.

## Limits

Original procedural cars/scenery/signs only. No licensed vehicles, copied courses or music; no open world, demolition system or online multiplayer. Route gates change objectives within this expressway, not the road topology.

## Follow-up QA

Contract settlement now checks expiry before success: a fifth clean pass on the
deadline earns the contract, while the same pass one tick late earns only its
normal pass score. A boundary regression exercises actual pass detection.
Shared HUD integration exposes slipstream and contract data; see
`SHARED_HUD_QA.md` for desktop/touch browser evidence.
