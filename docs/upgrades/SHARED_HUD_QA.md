# Shared objective HUD acceptance

The old shared HUD kept only the first three items with a `kind`, discarding the
rest. That hid Rally contracts/slipstream, Reactor precision, and Chrome recovery
missions even though each cabinet returned those fields.

`partitionHud` now selects three primary fields by health, energy, then combo,
retaining original order within each priority. Every unselected field, including
fields without a kind, appears in the common objective strip. This replaces the
pinball-only objective renderer. The strip wraps, has a viewport-sensitive height
limit, supports scrolling and keyboard focus, and never truncates its data.
New objectives declared first cannot displace a later health/ball-count field.

Two focused tests cover priority, stable order, complete partitioning, mutation
safety and updated objective values; TypeScript and diff checks passed. Headless
Chromium exercised Rally, Reactor, Chrome and Pinball at 1280×900, 390×844 and
844×390, with touch emulation where appropriate and reduced motion enabled.
Explicit development fixtures exposed new mechanic states; all twelve cases
rendered every declared HUD label in primary or secondary status, with no page
horizontal overflow, keyboard-focusable details and a stage over 100px each way.
The smallest measured stage height was 210px in landscape Pinball. Switching
between cabinets produced no page exceptions. These are software-rendered browser
checks, not hardware-mobile testing or proof of unbounded future content fit.
