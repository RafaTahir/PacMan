# Arcade validation — October 25, 2026

This records local validation of the five-cabinet expansion. It does not claim a new public deployment, physical-phone certification, ROM equivalence or cheatproof competition.

## Results

| Check | Result |
| --- | --- |
| Clean locked dependency install | Passed: 114 packages; no source/lock changes |
| TypeScript + production build + offline classic + Worker ESM | Passed |
| Vitest | 291 passed across 12 files:120 legacy,59 new-game,15 Pac-Man bridge,13 cross-game/protocol,83 backend/security,1 verifier benchmark |
| Full arcade browser suite | 19 groups passed; all four real desktop/touch game controls, indexed/depth-tested 3D geometry, full playfield framing, actual context recovery, switching/resource cleanup, preserved iframe, global score persistence |
| Final shared touch safety regression | Passed separately after the full 19: trusted swipe→Keep paused, duplicate/retargeted compatibility click rejection, legitimate keyboard and fresh-touch resume |
| Preserved Pac-Man gameplay browser | 23 groups passed |
| Preserved fullscreen/large-view browser | 15 groups passed |
| Preserved 3D graphics + production browser | 14 groups passed |
| Preserved experience + production browser | 17 groups passed, 1,320 assertions and 24 layouts |
| Unexpected console/page errors | None in passed final runs |

The final input-only change was verified by the new targeted shared regression and the complete 17-group classic suite. Unrelated already-passed new-game groups were not repeated. Raw reports remain under ignored `test-results/`; a portable summary with artifact/migration hashes is [validation-summary.json](validation-summary.json).

## Complete loops and persistence evidence

New-model tests include an ordinary-input full race, a legal-input three-sector reactor victory, an aimed-combat boss victory, and a launch/flipper-only pinball objective loop earning ramp, three-ball multiball and jackpot. Paired 7,200-tick replays verify determinism and bounded state. Pac-Man ranked tests include the original first-terminal boundary and a legal 7,272-frame run reaching level 2 with 6,710 points, matching the server's original-engine replay.

Actual local workerd/D1 accepted Reactor Breaker and Pinball replays, rejected conflicting duplicate submissions and retained accepted data across a Worker stop/start. Browser validation then issued real Chrome tickets, allowed natural no-input deaths, submitted actual replays through the initials form, and read accepted records from clean browser contexts in both all-time and daily views. No test state or clock mutation was used for those production-API acceptances. All records were in local/test databases; production migrations contain no competitors or score rows.

Independent backend review found and verified fixes for transient D1 claim recovery, ambiguous accepted retries, issuance timestamps after streamed body validation, bounded rank/cleanup scans, capped rate writes and cached health checks. 83 API/security tests cover these and injection/malformed bodies/initials/replay/duration/rate/duplicate constraints. Applied migrations 0000 then 0001 preserved existing accepted score/timestamp. Accepted all-time scores have no automatic expiry.

## Touch and graphics regressions

The classic suite exposed an actual mobile event edge: after swipes, Chromium could omit the compatibility click on Keep paused; a pointer-up-only fix then caused the later click to target the replacement Resume button. Final behavior cancels immediately/idempotently and accepts pointer-driven Resume only when that pointer press began on Resume. Keyboard/AT-style detail-zero activation and a fresh touch remain available. Six isolated 375px trials passed before the complete suite.

Actual WEBGL_lose_context exercises retain model/ticket/replay state. Old view disposal listeners are removed while the context is lost; native restoration creates a fresh view over the same simulation. Deliberate resume and cleanup passed without invalid-object/deletion errors. Missing-WebGL fixtures show a clear unavailable state for new games and explicitly labelled 2D fallback for Pac-Man.

Resource checks observed no abandoned game surfaces after returning home, one showroom context, one application RAF and one suspended audio context. Removed stages delete buffers/programs and lose their contexts. The maximum sampled framebuffer was 1,197,854 pixels. All real gameplay samples used indexed/depth-tested, nonplanar mesh geometry. Twelve original Pac-Man engine/rendering/audio/style files match the pre-expansion release byte-for-byte.

## Environment and limits

Tests used Node 24.19.0, Wrangler 4.152.0/workerd, headless Chromium 154.0.8037.57 on Linux 6.18.55 x86_64/glibc2.41, and ANGLE/Vulkan SwiftShader. Browser launch used only the container's normal `--no-sandbox`; no GPU/security overrides. Touch/rotation use DPR2 emulated viewports. No physical phone or hardware-GPU performance is certified.

Warnings retained in the main arcade report concern browser autoplay before a permitted gesture, screenshot GPU readbacks, redundant iframe fullscreen allowance and explicitly injected HTTP/WebGL failure fixtures. They are not hidden as successful hardware claims. CPU replay benchmarks are local Node/workerd observations, not a guarantee of provider plan quotas. Shared Three.js is about 145.6 KiB gzip; the build reports its normal large-shared-chunk warning. Cabinet modules load lazily. Per-game docs record geometry/CPU measurements and physics approximations.

Global rankings are 15-second visible-page polling, not instant sockets. Replay checking does not prove human play. Initials are duplicate-friendly display labels, not account identity. Google sign-in remains unavailable in this Sites build; no fake provider/perks or custom OAuth service is included.

## Curated screenshots

These are actual local-browser captures. Gameplay captures show unpaused play. Home empty-state validation uses an explicitly labelled HTTP fixture; the score screenshot shows genuinely accepted local test data, not seeded production competitors.

- [Desktop landing](screenshots/home-desktop.png), [mobile landing](screenshots/home-mobile.png)
- [Neon Rally](screenshots/neon-rally-mobile.png), [Reactor Breaker](screenshots/reactor-breaker-mobile.png)
- [Chrome Siege](screenshots/chrome-siege-desktop.png), [Midnight Pinball](screenshots/midnight-pinball-mobile.png)
- [Preserved Pac-Man](screenshots/pacman-desktop.png), [accepted global-score validation](screenshots/global-score-local-validation.png)

The coordinating publisher still owns the existing public Site, supported Worker adapter, schema-first D1 provisioning/migrations and deployment. Local tests, saved environment instructions and source-branch push are separate from publication.
