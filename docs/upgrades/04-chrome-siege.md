# 04 — Chrome Siege: Recovery Operations

## Three reviewed comparables

- **Geometry Wars 3: Dimensions** — [Push Square, Graham Banas, 26 November 2014, 9/10](https://www.pushsquare.com/reviews/ps4/geometry_wars_3_dimensions). Praises arena/objective variety and cautions about visual overload. Lesson: introduce a distinct objective while preserving clear combat silhouettes.
- **Nex Machina** — [PC Gamer, Chris Schilling, 29 June 2017, 89/100](https://www.pcgamer.com/nex-machina-review/). Rescue goals reward risky movement and repeat mastery. Lesson: make crossing the arena purposeful.
- **Assault Android Cactus** — [Destructoid, Chris Carter, 28 October 2015, 9/10](https://www.destructoid.com/reviews/review-assault-android-cactus/). Resource pressure and varied enemies encourage active movement. Lesson: rewards should change the immediate combat rhythm.

## Original implementation

Seeded gold maintenance pods appear at arena edges on a deterministic schedule. Collect a pod, carry it to the center extraction pad within fifteen seconds, and earn points, one hull repair and twelve seconds of autonomous support fire. Being hit drops cargo and imposes a 45-tick recovery delay; expired pods disappear without reward. A carried module, directional extraction marker, lit pad and original orbiting support drone show each state.

The first six dash frames can parry an intersecting hostile projectile. A reflected round reverses direction, becomes a friendly 18-damage shot and awards a small once-only bonus. Existing shot caps constrain reflection; ordinary later dash protection remains. A gold parry ring, mission HUD, cargo countdown and support timer make the timing and objectives explicit. Hostile/friendly bullet geometry updates correctly on reflection.

## Acceptance

14 Chrome tests and TypeScript pass. New tests cover seeded spawn, carry/deposit, one reward, timeout, finite support, actual dash reflection, one parry award, and cargo-drop recovery delay. Existing legal-input boss victory, deterministic replay, bounds and mesh lifecycle tests remain passing. Browser visual acceptance remains pending at final gate.

## Limits

One rectangular combat arena, existing enemy families and three-phase boss remain. No copied humans, androids, arena layouts, soundtracks or commercial effects. This release adds tactical recovery and projectile timing, not the references' full campaigns or multiplayer.

## Follow-up QA

The recovery direction cone had a reversed north/south component. Its fixed
rotation now agrees with the centerward position and points toward extraction
from every quadrant. A rendered-scene transform test checks five positions,
visibility after cargo removal and disposal. The shared objective strip now
exposes recovery countdown and mission feedback; see `SHARED_HUD_QA.md` for
desktop/touch browser evidence.
