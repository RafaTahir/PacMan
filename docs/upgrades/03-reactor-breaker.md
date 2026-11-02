# 03 — Reactor Breaker: Flux Control

## Three reviewed comparables

- **Shatter** — [Push Square, Sammy Barker, 24 July 2009, 9/10](https://www.pushsquare.com/reviews/psn/shatter). Its reviewed active ball control and energetic presentation support adding deliberate mid-flight decisions.
- **Wizorb** — [Push Square, Christopher Ingram, 3 August 2012, 8/10](https://www.pushsquare.com/reviews/psminis/wizorb). Combines brick breaking with limited magical tools and progression. Inspiration: a clearly limited recovery resource alongside skill-based mastery.
- **Breakout: Recharged** — [Nintendo World Report, Joel A. DeWitte, 4 March 2022, 8/10](https://www.nintendoworldreport.com/review/59765/breakout-recharged-switch-review). Reviewed contemporary power-up-driven score attack provides a reference for explicit short-session goals and crisp feedback.

These are strong reviewed brick-breaker comparables. Arkanoid DS was considered but omitted because reviews are sharply mixed; this is not an objective top-three ranking.

## Original implementation

A flux tether changes the ball's horizontal velocity toward the paddle while Launch is held, only on descending balls in the return corridor. It preserves velocity magnitude, caps its lateral component and consumes a separate visible reserve. Idle regeneration and destroyed layers replenish flux. Existing pulse charge remains a separate tactical decision; keyboard Enter can launch without holding the tether.

Three consecutive center returns activate five seconds of overdrive, adding one damage per tower contact. Precision rewards are deterministic and bounded; off-center returns break progress, and losing the final active ball clears progress/overdrive. Original geometric beam links, paddle pips and an animated containment rotor communicate the new state; reduced motion holds the rotor still. HUD and etched deck instructions explain both loops.

## Acceptance

24 Reactor tests and TypeScript pass. Tests cover speed-preserving tether behavior, upward-ball exclusion, depletion, three-return activation, extra damage, exact expiry and reset conditions. Continuous collision, chain reaction, bounded pool and replay tests remain passing. The full three-sector legal-input solver uses Enter/LAUNCH, deliberately avoiding continuous tether input so its planned angled returns remain valid.

## Limits

The three existing sectors and power-up families remain. No commercial boss set, story campaign, recordings or assets were copied. Tether steering is an original bounded adaptation, not Shatter's complete physics or feature set. Browser graphics acceptance remains part of the final pass.
