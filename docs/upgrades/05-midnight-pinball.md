# 05 — Midnight Pinball: Night Market Orders

## Three reviewed comparables

- **Demon's Tilt** — [Nintendo Life, Damien McFerran, 20 December 2019, 8/10](https://www.nintendolife.com/reviews/switch-eshop/demons_tilt). Staged table objectives and strong ball readability inform clear mode progression.
- **Pinball FX3** — [Nintendo Life, Liam Doolan, 21 December 2017, 8/10](https://www.nintendolife.com/reviews/switch-eshop/pinball_fx3). Learnable trick shots, table guidance and convincing weight inform an explicit called-shot challenge using existing physical contacts.
- **Yoku's Island Express** — [Nintendo Life, Jon Mundy, 29 May 2018, 9/10](https://www.nintendolife.com/reviews/switch-eshop/yokus_island_express). A progression/world comparator, not a score-table simulation: sequential physical goals and a responsive setting inform the original market order ladder.

## Original implementation

A new three-stage mode ladder requires six bumper contacts, then all three distinct star targets, then both physical routes. Each order has thirty seconds; rewards rise through 500, 1000 and 5000 base points. Completion opens a twelve-second ×2 festival for subsequent table scoring. Repeated same targets/routes cannot substitute for the missing ones, and tilt cancels the festival/mode. Existing Island Tours and multiball remain independent.

Before plunging, the flippers select a called target. Release the plunger at 55–75% charge and hit that selected star within the existing launch window for a 6000-point skill shot; an ordinary valid skill shot retains 2000 points. The selected target is captured per ball. Original target rings, three mode lamps, a plunger charge strip and sweet-spot marker explain the new goals, alongside HUD instructions. Static batching explicitly excludes these dynamic objects.

## Acceptance

20 pinball/market tests and TypeScript pass. Added checks cover target selection, a physical called-shot contact, six-bumper progression, unique target/route requirements, one completion reward, bounded festival duration and expired-mode restart. Existing swept collision, gravity, actual flipper surface velocity, ramp rollback, multiball, tilt and deterministic replay tests remain passing.

## Limits

One original Malaysian island table remains; no commercial table library, world campaign, demons, licensed art/music or physics code was copied. The new objective ladder provides additional table mastery, not the references' complete content sets. Browser visual acceptance remains pending at release gate.

### Launch reachability follow-up

A legal-input trajectory probe showed the old shooter-lane geometry naturally reached only the right star across the new power window. An original launch diverter now opens for a precision plunge at the actual shooter-lane exit and directs the ball toward the selected star; all subsequent collisions remain physical. Three end-to-end tests now earn called shots at each target using only launch/flipper inputs, without teleporting the ball. The called-shot HUD switches to results after launch; ordinary drains preserve market progress, while tilt clears it. Festival completion awards its base reward before the temporary doubling applies to later scores. Updated focused total: **23 tests**, plus TypeScript.
