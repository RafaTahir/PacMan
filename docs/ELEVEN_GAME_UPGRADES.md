# Five-game release — requested cutoff at Midnight Pinball

The user changed the scope to **stop after Midnight Pinball, then push and deploy**. This release upgrades the first five cabinets only. All eleven existing cabinets remain available; cabinets 6–11 keep their starting gameplay and assets.

Starting source: `62b622a80b994ebc27ecde33e21ebf3087275950`, tree `9875391b03df453e63e36318218b7696337214ed` (identical to deployed source `951af1c`). Implementations were researched, developed, checked and committed sequentially. Each research note names three positively reviewed comparables, review evidence, URLs, original decisions, acceptance checks and limitations. These are selected references, not a universal top-three ranking or commercial feature-parity claim. New geometry/code is original; no proprietary assets or recordings were copied.

| Order | Cabinet | Release status | Research and implementation evidence |
| --- | --- | --- | --- |
| 1 | PAC-MAN | Circuit Relay, dot flow, ward, accessible status | [Research and acceptance](upgrades/01-pacman.md) |
| 2 | Neon Rally | Slipstream/slingshot, route contracts, district architecture | [Research and acceptance](upgrades/02-neon-rally.md) |
| 3 | Reactor Breaker | Flux tether, precision overdrive, containment graphics | [Research and acceptance](upgrades/03-reactor-breaker.md) |
| 4 | Chrome Siege | Recovery missions, support drone, timed dash parries | [Research and acceptance](upgrades/04-chrome-siege.md) |
| 5 | Midnight Pinball | Market orders, festival mode, called skill shots/diverter | [Research and acceptance](upgrades/05-midnight-pinball.md) |
| 6 | Orbit Salvage | Excluded from this release; original cabinet retained | Upgrade preserved separately at `bbad662`, branch `codex/arcade-later-cabinets-wip` |
| 7 | Tidal Courier | Original cabinet retained; no implementation changes | Research only before cutoff |
| 8 | Prism Circuit | Original cabinet retained | Not upgraded in this release |
| 9 | Skybound Stack | Original cabinet retained | Not upgraded in this release |
| 10 | Canopy Sprint | Original cabinet retained | Not upgraded in this release |
| 11 | Hollow Bureau | Original cabinet retained | Not upgraded in this release |

Orbit was committed before the cutoff arrived, then reverted from the release with `ad25e46`. The work is retained on the separate WIP branch rather than discarded. A final diff against the starting commit confirms **zero changes** to all six later game folders and their model tests. The release history retains the preservation/revert audit trail.

## Shared changes and score safety

- `after-hours-v3` is the shared ticket version. Current boards explicitly filter v3; v2/v1 and complete historical archives remain readable. Existing scores and migration bytes are untouched.
- An unfinished v2 ticket cannot be replayed under changed v3 physics. It receives a clear reload/new-run response without changing the ticket; its local best remains available. Already accepted v2 submissions still support exact digest-verified retries, including after expiry, while altered retries fail.
- The version boundary applies to the shared service across all eleven cabinets. Cabinets 6–11 have unchanged gameplay but start a fresh v3 board alongside the retained v2 archive. Scores across changed scoring systems are not silently compared. Existing indexes may scan historical rows during version-filtered reads; no production index/schema migration was added.
- A generic responsive objective strip exposes every HUD field, with health/energy prioritized in the main HUD. The eleven-game badge and Hollow Bureau leaderboard option are corrected.

## Final release gates — 2 November 2026

- `npm test`: **414 tests, 23 files, all passing**.
- `npm run build`: TypeScript, Vite, standalone PAC-MAN and full-stack Worker build pass.
- `npm run lint`: passes.
- `node scripts/verify-migration-release.mjs`: passes frozen migration hashes/journal, fresh native D1 installation, populated future-upgrade fixtures, known populated-0003 failure/rollback, corrupted guard rejection/rollback, accepted-row preservation and FK enforcement. Expected rejected-SQL diagnostics appear during the regression; the final gate exits 0. No production database was accessed or changed.
- `node scripts/package-sites.mjs` and `node scripts/smoke-sites.mjs`: pass **26 GET/HEAD asset checks**, byte/hash/ETag checks, SPA/404/conditional requests, API/binding forwarding and byte-identical migration/hosting packaging.
- `git diff --check`: passes. Migration SQL/meta, baseline hashes, hosting identity and later game source/tests match the starting version exactly.
- Packaged full-stack entry: `dist-sites/server/index.js`; SHA-256 `b8552d74da42e135e57092109169fd4ba6aa09e3295c6470e53fcf8886c2ace7` (3,290,304 bytes; 2,388,047 embedded asset bytes). Build artifacts are generated, not committed.

## Browser evidence and limits

PAC-MAN desktop/portrait/landscape checks verify visible/accessible relay status and deduplicated announcements; explicit disabled-WebGL runs verify its labelled 2D fallback. Twelve graphical HUD checks cover Rally, Reactor, Chrome and Pinball at desktop, portrait touch and landscape touch with reduced motion: all declared HUD fields remain reachable, no horizontal overflow, stage at least 210px high, no page exceptions. See [shared HUD QA](upgrades/SHARED_HUD_QA.md). Pinball adds actual scene gauge/batching/disposal checks and 195/195 legal called-shot trajectories across five seeds, three targets and thirteen charge lengths.

These browser checks use headless software graphics. They establish rendering/layout behavior in that environment, not physical phone/GPU performance, subjective control feel or commercial-game parity. No real multiplayer, commercial campaigns or content libraries were added.

## Publisher handoff

Parent publisher owns production publication. Use **this release branch**, not `codex/arcade-later-cabinets-wip`, and deploy only to existing public Site `appgprj_6ae82e07659081919c1cf6eb5f8de9f4`, URL `https://after-hours-arcade-next.rafaeitahirmy.chatgpt.site`, with D1 binding `DB`, no R2 and unchanged audience. The OLD Site/database must remain untouched.

This is a schema-free application release: **do not apply production migrations, reset/replace a database, create another Site or introduce request-time schema mutation**. Preserve the existing TST 290 record and future user scores. Follow `MIGRATION_SAFETY.md` and `MIGRATION_0003_RELEASE.md` for any independently proposed future schema change.

Build and package the exact pushed commit. For the standard Sites helper archive, copy `dist-sites/server/index.js` to `dist/server/index.js` as already established by the parent publisher. Retain the embedded full-stack server; do not replace it with static-only output. After publication, verify current Site identity/audience, all eleven board reads (including v2 archive), current health/ruleset, the changed cabinets, and a legitimate v3 score submission. Publication and live verification are pending with the parent at this handoff.
