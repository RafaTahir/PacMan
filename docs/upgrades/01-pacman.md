# 01 — PAC-MAN: Circuit Relay

## Three reviewed comparables

- **Pac-Man Championship Edition DX** — [GameSpot, Carolyn Petit, 24 November 2010, 9/10](https://www.gamespot.com/reviews/pac-man-championship-edition-dx-review/1900-6284565/). The review praises readable danger intervention, chains and varied challenges. Lesson: make risk and recovery legible, with explicit scoring goals.
- **Pac-Man Championship Edition** — [TouchArcade, Blake Patterson, 10 December 2009](https://toucharcade.com/2009/12/10/pac-man-championship-edition-welcome-back-old-friend/). Strongly positive review of timed score attacks, changing objectives and touch controls. Lesson: a familiar maze benefits from short, purposeful routes.
- **Pac-Man 256** — [GameCritics, Zack Zweizen, 14 July 2016, 8/10](https://gamecritics.com/zack-zweizen/pac-man-256-review/). Praises short-session presentation and power-up variety, while noting repetition over longer sessions. Lesson: layer an optional objective onto the survival loop.

## Original implementation

Circuit Relay adds four authored, numbered geometric beacons to existing walkable intersections. The seed selects the first beacon. Collect successive legs within approximately fifteen seconds; points rise with each leg. Four legs add a completion award and a ward that absorbs one collision, with a brief escape window. A failed leg resets relay progress; death resets flow and unbanked relay progress. Every twenty dots in an uninterrupted flow awards a capped bonus; a 2.5-second collection gap resets flow.

The Canvas compositor draws active/inactive beacon rings, progress/deadline text, flow count and ward outlines over both WebGL and 2D actors. Essential cues use numbers/text as well as color. Reduced motion removes ring animation. Existing original synthesized bonus sounds accompany rewards, and result copy counts circuits. Keyboard, queued turns, two-player local play, pause and existing sound settings remain supported.

`Game({relay:true})` is explicitly used by the actual standalone/embedded clients and server replay. The default pure engine retains classic behavior to keep the pre-existing maze fidelity suite meaningful. Ranked scores use the release's v3 ruleset; old scores are not reinterpreted.

## Acceptance

- 115 tests passed across engine, relay, ranked bridge and experience suites; `tsc --noEmit` passed.
- New tests cover seed/target order, reachable beacons, no repeated same-beacon farming, exact expiry boundary, capped flow awards, gap reset, pause/restart, ward consumption and escape-window expiry.
- Existing ranked bridge test still exercises a genuine full 7272-frame run through a level transition and server/client parity under the new mode.
- Browser and full packaged release checks remain pending until the release gate.

## Limits

No commercial art, recordings, code, sleeping-ghost trains, procedural endless maze or multiplayer expansion was copied or added. The existing classic maze and characters remain legacy content; new geometric overlays and mechanics are original. This is a substantial original score-attack variation, not feature parity with the referenced commercial games.
