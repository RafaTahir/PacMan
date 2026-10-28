# Capability and play-feedback review — 2026-10-28

The lobby now probes the WebGL2 API required by the nine Three.js games before players select a cabinet. When unavailable it displays an upfront explanation, marks affected cards, and offers a requirements view with a working route to Pac-Man. All ten cabinets and their genuine global leaderboards remain browsable. No game or score is substituted.

The hero uses original illustrated cabinet artwork if 3D initialization fails or its context is lost. The static preview changes with carousel selection, and its label distinguishes it from live 3D. Partially initialized lobby graphics are disposed before fallback. The disposable capability probe is released immediately.

Pac-Man independently reports its actual renderer over the validated iframe bridge. Its opening description says 3D mesh or 2D fallback accordingly. Missing metadata from older children uses neutral copy. WebGL2 being absent is not evidence that Pac-Man's WebGL1 meshes are unavailable. Origin/source/session protections remain in place, and renderer changes update the description without resetting gameplay.

Pinball has a readable play-area objective strip: three stars then left ramp for multiball, left ramp plus right river for Island Tour, live route progress and tilt guidance. Score status explicitly distinguishes local practice, global submission pending, verification, failure and confirmed save. Completed-run states persist through HUD updates; unchanged status text is not repeatedly written to the live region.

## Verification

- TypeScript and `npm run build:sites` pass.
- 34 targeted bridge/controller tests pass, including six new graphics-report regressions.
- Focused Chromium checks cover WebGL2-only denial and all-WebGL denial at desktop and390px touch; all ten cards/board options, nine requirement badges, changing static artwork and actual Pac-Man3D/2D wording pass.
- Normal-browser checks cover native lobby context loss, pinball objectives/tilt,390×844portrait and844×390landscape layouts, local result, global pending/verification/error/retry/saved states, offline-ranked fallback and stable announcements. Final post-patch rerun passes; an initial immediate-status timing assertion led to prompt phase feedback. All HTTP score responses in these UI checks are explicitly labelled fixtures; no public or real DB score writes occur.
- The existing unsupported-graphics browser regression passes.
- Actual packaged Worker smoke passes19GET/HEAD asset hashes/types/lengths, SPA/404/304, API binding/status/header forwarding and migration copies.
- The exact standalone production artifact, served by native workerd with isolated real local D1, passes normal lobby/Pac-Man3D opening, live pinball goals/practice status, and all-WebGL-blocked mobile fallback/Pac-Man2D opening. No DEV hooks are used in this production check and no score writes occur.
- Browser: headless Chromium154.0.8037.57, normal container `--no-sandbox` only. Graphics-denial cases are injected and labelled. Touch viewports emulate phones; physical-device behavior is unverified.

Actual screenshots are in `docs/screenshots/capability-review/`.

Database schema/migrations, API validation, game simulations, ruleset, all accepted scores and Site hosting identity are unchanged. No new migration is needed for this review. Publishing to the existing public Site is explicitly authorized but must use the coordinating publisher because this executor has no Sites deployment tools. Build/source push does not establish that a new version is live.
