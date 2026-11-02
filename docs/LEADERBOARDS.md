# Persistent global leaderboards

Every game has a global all-time leaderboard backed by the deployment's D1 `DB` binding. The eleven game IDs are `pacman`, `neon-rally`, `reactor-breaker`, `chrome-siege`, `midnight-pinball`, `orbit-salvage`, `tidal-courier`, `prism-circuit`, `skybound-stack`, `canopy-sprint`, and `hollow-bureau`. Boards are empty until people submit accepted runs. No competitors or production scores are preloaded.

Accepted scores and their run records have **no expiry**. Reloading the browser, opening another device, deploying the Worker again, or moving to a new UTC day preserves them as long as the same D1 database remains bound. Daily boards are additional UTC date filters over that permanent history. Redeployments must reuse the existing Sites database; creating a replacement database creates a different leaderboard.

A three-letter A–Z guest label is public and nonunique. It is not an account, ownership credential, verified identity, or cross-device profile. Duplicate labels are allowed. The server checks exact formatting and an explicit profanity/slur blocklist; the client must render all API text with text nodes, never HTML interpolation. Account providers are not required. The Sites environment used for this project does not provide Google authentication, so this implementation provides no custom OAuth flow, session system, or simulated Google sign-in.

## API

All API responses are JSON with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Requests must use the same origin. There are no permissive CORS headers. POST requires `application/json`; both announced and streamed bodies are limited to 400 KiB. Errors use `{ "error": { "code": "...", "message": "..." } }`; rate and early-finish errors also provide `Retry-After`.

- `GET /api/health` reports `{ok,database,ruleset,checkedAt,cached}` when a DB binding is present. A fresh successful probe reports `database:"connected"`; a result reused for up to ten seconds explicitly reports `database:"recently_connected"` with its original `checkedAt`. Failed probes are also cached for ten seconds and return 503. A missing database binding or unapplied schema returns 503. The endpoint does not claim that a cached observation is a fresh database check. No in-memory scores replace unavailable persistence.
- `GET /api/leaderboards?game=pacman&scope=all&limit=20` returns `{game,scope,ruleset,entries,updatedAt}`. Entries contain `{rank,initials,score,runId,finishedAt,verified:true,ruleset}`. Omitted `ruleset` preserves the full archive; the UI explicitly selects the current ruleset. Ordering is score descending, server finish time ascending, then run UUID ascending. `limit` must be 1–100. `scope` is `all` or `daily`. Daily optionally accepts `day=YYYY-MM-DD`, a real UTC date no later than today; omitted day means today. Repeated, unknown, or malformed parameters are rejected.
- `POST /api/runs` with `{game,ruleset:"after-hours-v3"}` returns HTTP 201 and `{runId,seed,game,ruleset,tickRate,maxTicks,expiresAt}`. The server issues a random UUID and cryptographic uint32 seed. Issuance and expiry timestamps are captured after the body has been fully read and validated and the seed generated, so slow upload time cannot count as play time for an unknown seed. Tickets expire after 20 minutes if they have not been accepted.
- `POST /api/runs/:runId/finish` takes `{initials,frames,inputs,score?}` and returns `{accepted:true,entry,score,verified:true}` after replay and D1 persistence. An identical retry of an accepted submission returns the persisted result with `replayed:true` and never creates a second score; a conflicting retry returns 409. The optional claimed score must match the server-derived score. Finish-response `entry.rank` is exact within that run’s ruleset for the top 100 and otherwise `null`; it is also `null` if the optional ranking query fails. Ranking failure never masks a successful score acceptance. GET leaderboard entries always have their accurate numeric positions. Finish bodies cannot override the game, seed, ruleset, timestamps, or identity.

Input records are `[tick,x,y,aimX,aimY,buttons]`, recorded only when the complete input changes from the previous input. Initial input is `{x:0,y:0,aimX:0,aimY:-127,buttons:0}`. All values are integers; axes are −127…127, buttons 0…15. Ticks must be strictly increasing, unique, and in `0…frames-1`. Pac-Man uses cardinal movement with zero buttons; its default direction is left. At most `frames+1` records are accepted. Ten additional games run at 60 Hz for at most 7,200 ticks. Pac-Man preserves its original 60.60606060606061 Hz simulation and uses at most 7,272 ticks. Clients must use the returned limits and stop recording at the actual terminal frame or ranked time cap.

A completed terminal game or full two-minute run is required. A client cannot truncate an ongoing game to bank its score. Trailing frames after terminal state, malformed input, invalid initials, incorrect scores, and conflicting repeated submissions are rejected. The server checks that elapsed wall time covers the recorded frames, allowing 2.5 seconds of timing tolerance. An early finish or rejected display label is retryable; a claimed run that fails replay validation is permanently rejected.

`verified:true` means the server reproduced the score from the issued seed and accepted input stream. It does not prove a human used the controls, forbid automation/tool-assisted play, or verify the guest's identity.

## Persistence, concurrency, and abuse limits

`db/schema.ts` is the Drizzle schema. The append-only SQL migrations, their snapshots, and `drizzle/meta/_journal.json` are generated together and checked in. `0000_initial_leaderboards.sql` creates the original schema; `0001_recoverable_claims_and_pending_expiry.sql` adds nullable verifier-lease columns and a partial index over unaccepted tickets. It preserves every existing run and score, and does not rewrite the initial migration. `server/index.ts` is the Worker module entrypoint; `server/app.ts` implements the routes. It uses the portable D1 subset from `server/d1.ts` and imports the same pure game models as the client.

Requests use one parameterized SQL statement per `prepare()`. Multiple statements use D1's transactional `batch()`. No request executes DDL. Runs transition atomically from `issued` to `verifying` under a random claim token and 30-second lease. Each acceptance write and claim release checks that exact token, so a superseded verifier cannot commit or release a newer claim. A transactional batch inserts the immutable score and marks the run `accepted`. A batch failure releases its claim for retry; if release is also unavailable or the verifier is interrupted, the next request can recover the claim after its lease expires. `run_in_progress` responses include `Retry-After`. Ambiguous errors after commit recover the accepted entry when readable; otherwise an identical later retry retrieves it by comparing its persisted replay hash, frames, guest label, and optional claimed score. The score table's run primary key provides an additional duplicate constraint. Initials are deliberately not unique.

Network-scoped counters allow 12 starts, 18 finishes, and 120 board reads per minute. A counter stops increasing at its cap: a read rejects already-capped buckets and a conditional upsert prevents concurrent increments beyond the limit. A bounded isolate-local digest cache rejects repeated capped traffic without further D1 reads or writes for the remainder of that minute. These are application-level limits, not an upstream denial-of-service filter. Distributed traffic, cold isolates, and initial allowed requests still consume CPU and D1 operations; no free-plan capacity guarantee is claimed. Network metadata is hashed with an installation-specific random salt stored in D1. Raw IP addresses, account identifiers, replay bodies, and database errors are not logged by the application. `RATE_LIMIT_SECRET`, if configured as a trusted deployment secret, overrides the persisted salt. The Cloudflare edge supplies `CF-Connecting-IP`; clients' identity headers have no effect. Without edge network metadata, requests share an anonymous bucket. Deploy behind the platform's trusted edge rather than a proxy that forwards arbitrary client network headers.

Occasional start requests prune at most 100 expired rate counters and 100 unaccepted expired tickets per sweep. Ticket cleanup explicitly uses the partial pending-expiry index, so permanent accepted history is excluded from its scan. Finish ranking returns at most the top 100 within a ruleset instead of counting the full accepted history; filtering historical rows can increase index scan cost. The cleanup predicate explicitly excludes accepted runs and any run referenced by a score. No cleanup path deletes accepted scores. There is no administrative score deletion API.

## Deployment on the existing Site

The active Sites project is `appgprj_6ae82e07659081919c1cf6eb5f8de9f4`, with public
audience, logical D1 binding `DB` and no R2 binding. Preserve that Site and database.
The former project `appgprj_6add9f91d5088191b2397efdda9c3663` remains untouched.

The v3 release is schema-free: do not run production migrations, reset data, or
create a replacement Site. Run the test/build/package checks and native migration
release gate, then publish the full-stack Worker and assets to the existing Site.
After publication check health, all eleven boards, historical score preservation
and legitimate replay submission. Do not seed demonstration competitors.

For future schema work follow `MIGRATION_SAFETY.md` and
`MIGRATION_0003_RELEASE.md`: inspect the actual live journal using a supported
mechanism, append rather than alter migration history, and establish a supported
transactional migration path before changing production. Local Wrangler's zero
UUID is a development placeholder, never a production database target.

## Local verification

Node 24 is used for the integration tests' real `node:sqlite` implementation. The D1 adapter in `tests/leaderboard.test.ts` runs the checked-in migration on an actual SQLite database, implements transaction batches, and rejects request-time DDL or multiple statements per prepare.

```sh
npx vitest run tests/leaderboard.test.ts tests/leaderboard-benchmark.test.ts
npm run db:migrate:local
npm run dev:api
```

If the execution sandbox cannot write Wrangler's default configuration directory, prefix both Wrangler commands with `XDG_CONFIG_HOME=/tmp/after-hours-xdg WRANGLER_LOG_PATH=/tmp/after-hours-wrangler.log`.

A real workerd smoke run completed Reactor Breaker at 1,254 frames / 2,730 derived points and retained its entry after stopping and restarting the Worker against the same local D1 database. The original implementation rejected its duplicate; the hardened API now returns the existing entry for matching accepted retries and rejects conflicting retries. After the pinball optimization, a second real workerd run accepted Midnight Pinball at 4,270 frames / 56,440 derived points; the finish request took about 74 ms including local D1 I/O. Both smoke entries exist only in an isolated `/tmp` integration database. Applying `0001` to that existing real D1 database preserved both records; a matching retry of the original pre-migration Reactor Breaker submission returned HTTP 200 with `replayed:true`, its original timestamp and score, and one existing entry. A conflicting-label retry returned 409. Fresh/cached health status was also checked in workerd.

The tests cover empty boards, all ten real replay models, score tampering, changed seeds/unsupported fields, stale rulesets, unfinished/trailing replay frames, ordered event bounds, missing/expired/concurrent tickets, matching and conflicting accepted retries, precommit rollback and postcommit response failures, failed claim release and expired-lease recovery, superseded-token protection, optional-rank read failure, slow-upload issuance timing, capped-traffic write/read avoidance, cached health probes, partial-index cleanup and bounded ranking with 10,000 explicit accepted test fixtures, elapsed-time retries, initials moderation, all-time and daily ranking, query injection and bounds, malformed/oversized JSON, missing persistence, cross-origin access, all rate buckets, and database close/reopen persistence across UTC date changes. Test fixtures and local smoke scores exist only in isolated local test databases.

`tests/leaderboard-benchmark.test.ts` measures six complete replay samples per game (three seeds, neutral and active inputs). On this workspace, the sample maxima after collision-geometry optimization were approximately Pac-Man 7 ms, Rally 6 ms, Breaker 10 ms, Siege 41 ms, and Pinball 56 ms in Node wall time. The latter three include full 7,200-tick runs. Pinball was reduced from an initial observed maximum of about 130 ms while preserving serialized game state and signals; its dedicated warm stress profile additionally exercises three simultaneous balls. These are measured samples, not a production CPU bound; tune the platform's Worker CPU budget and monitor actual verification usage. Entity counts and per-tick loops are capped in every new game. No verifier accepts unbounded frame counts or replay records.


## Ten-cabinet migration and ruleset

Apply the new append-only `0002_additional_cabinets.sql` before uploading the ten-game Worker. It only creates `cabinet_runs`, `cabinet_scores`, and their indexes/constraints; it neither rebuilds nor mutates the original `runs`, `scores`, settings or rate tables. Original accepted history and original foreign keys remain in place. New cabinets use the additional table pair; each game retains the same all-time/daily API and permanent acceptance semantics. Fixed server-owned storage routing never accepts SQL identifiers from clients.

The tropical pinball expansion changes simulated routes/scoring and therefore ships with `after-hours-v2`. Unaccepted v1 tickets receive an explicit `ruleset_mismatch` and require a fresh run after reload. Accepted v1 scores remain permanent, appear on the original games' boards and support exact idempotent recovery without being replayed using changed mechanics. Existing scores are historical verified results under their saved ruleset; the all-time board includes both versions, so pinball scores across the new and old table rules are not strictly comparable. The migration does not relabel, erase or rescore them.

Health probes now require both additional tables. A deployment with unapplied migration returns unavailable rather than claiming global rankings work. Cleanup is bounded to 100 abandoned tickets in each storage namespace and never expires accepted scores. No request performs schema changes. The test database applies `0002` over pre-existing accepted original history, verifies row/schema equality and foreign-key integrity, then checks new-game model-derived acceptance and matching/conflicting duplicate behavior. Test-only fixture rows are never installed in a live leaderboard.


## Eleven-cabinet v3 release: no database migration

`after-hours-v3` changes game mechanics and scoring. New ranked tickets use v3;
client and Worker import the same pure fixed-step model for every cabinet.
Unaccepted v2 (or v1) tickets fail closed with HTTP 409 `ruleset_mismatch` before
claiming, replaying, or changing the ticket. Their local result remains on the
player's device; the player must reload and start a new ranked run. There is no
claim of uninterrupted submission across this deployment. Old inputs are never
replayed against the new mechanics and old claimed scores are never trusted.

Already accepted runs take the idempotent recovery path before the version gate.
An exact retry is verified against the persisted hash of the original ruleset,
game, server seed, frames, and inputs, plus original initials and claimed score;
it returns the original durable result without replaying or changing it.
Conflicting retries remain HTTP 409. Accepted scores, run rows, foreign keys,
migration SQL and metadata are unchanged; this release runs no production DDL.

The new leaderboard UI defaults to **Current · v3**, and exposes **Previous · v2**,
**Original · v1**, and **Full archive · mixed rules**. `GET /api/leaderboards`
accepts optional `ruleset=after-hours-v3|after-hours-v2|after-hours-v1|all`; omitting
it retains the existing full historical archive API for older consumers. All-time
and daily periods work within each selected ruleset. Responses identify the board
filter and every entry's original `ruleset`; cache keys include that filter.
Finish-response ranks are within the run's ruleset. The archive is a historical
listing: scores from different rules are not directly comparable, are never
normalized or rescored, and do not displace current competitors from the v3 board.
Device-local personal bests remain historical device records across versions.

No index is changed. Exact ruleset filtering uses the existing ordered game/day
indexes, potentially scanning older rows before finding a requested era. Results
and cache sizes remain bounded, but filtering cost may grow with historical data;
a future optimization requires a separately reviewed additive migration. The
10,000-row fixture checks index use, preserved history and per-version rank,
not a constant-cost guarantee at arbitrary production scale.

Transition integration tests cover both table families: unchanged pending v2
tickets, rejected stale starts, persisted v2 accepted retry and forged retry
rejection, visible archive rows, current/history cache separation, daily history,
and intact foreign keys. Deployment must run the existing native migration gate
even though this is a schema-free release.
