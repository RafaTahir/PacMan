import { GAME_IDS, RULESET_VERSION, type GameId } from "../src/arcade/shared/contracts";
import { type D1Database, type D1Result, type D1Statement, type Env, successful } from "./d1";
import { ApiError } from "./errors";
import { cabinetStore, legacyStore, storeForGame, type Store } from "./cabinet-store";
import { validateInitials } from "./initials";
import { replayScore, runLimits, validateReplay } from "./replay";

export const MAX_BODY_BYTES = 400 * 1024;
const RUN_LIFETIME_MS = 20 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 2500;
const MAX_SCORE = Number.MAX_SAFE_INTEGER;
const CLAIM_LEASE_MS = 30_000;
const HEALTH_CACHE_MS = 10_000;
const BLOCKED_CACHE_LIMIT = 2048;
const BOARD_CACHE_SECONDS = 10;
const PRUNE_BATCH = 100;
const saltCache = new WeakMap<D1Database, string>();
const blockedRates = new Map<string, number>();
const healthCache = new WeakMap<D1Database, { checkedAt: number; connected: boolean }>();

type JsonObject = Record<string, unknown>;
interface RunRow { id: string; game: GameId; ruleset: string; seed: number; issued_at: number; expires_at: number; status: string; claim_token: string | null; claim_expires_at: number | null }
interface ScoreRow { run_id: string; initials: string; score: number; finished_at: number; ruleset: string }
interface AcceptedScoreRow extends ScoreRow { frames: number; replay_hash: string }
export interface LeaderboardEntry { rank: number | null; initials: string; score: number; runId: string; finishedAt: string; verified: true; ruleset: string }

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const shouldSweep = (): boolean => (crypto.getRandomValues(new Uint8Array(1))[0] & 31) === 0;
function json(value: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(value), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}
function gameId(value: unknown): GameId {
  if (typeof value !== "string" || !GAME_IDS.includes(value as GameId)) throw new ApiError(400, "invalid_game", "Choose a supported arcade game.");
  return value as GameId;
}
function fields(body: JsonObject, allowed: string[]): void {
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw new ApiError(400, "invalid_field", "The request contains an unsupported field.");
}
async function readJson(request: Request): Promise<JsonObject> {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json")
    throw new ApiError(415, "json_required", "Use application/json for this request.");
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES))
    throw new ApiError(413, "body_too_large", "Replay body is too large.");
  if (!request.body) throw new ApiError(400, "invalid_json", "A JSON request body is required.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ApiError(413, "body_too_large", "Replay body is too large.");
      }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new ApiError(400, "invalid_json", "Request body must be valid JSON."); }
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400, "invalid_json", "Request body must be an object.");
  return body as JsonObject;
}
function sameOrigin(request: Request, url: URL): void {
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "cross_origin", "This API accepts requests from this arcade only.");
}
function dbOrThrow(env: Env): D1Database {
  if (!env.DB) throw new ApiError(503, "database_unconfigured", "Global leaderboards are not configured on this deployment.");
  return env.DB;
}
async function execute(statement: D1Statement): Promise<D1Result> { return successful(await statement.run()); }
async function batch(db: D1Database, statements: D1Statement[]): Promise<D1Result[]> {
  const results = await db.batch(statements);
  for (const result of results) successful(result);
  return results;
}
async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function rateSalt(db: D1Database, env: Env): Promise<string> {
  if (env.RATE_LIMIT_SECRET) return env.RATE_LIMIT_SECRET;
  const cached = saltCache.get(db);
  if (cached) return cached;
  let row = await db.prepare("SELECT value FROM service_settings WHERE key = ?").bind("rate_salt").first<{ value: string }>();
  if (!row) {
    // Application data initialization, never request-time DDL. Concurrent first
    // requests converge on the one persisted, installation-specific salt.
    await execute(db.prepare("INSERT OR IGNORE INTO service_settings (key, value) VALUES (?, ?)").bind("rate_salt", crypto.randomUUID() + crypto.randomUUID()));
    row = await db.prepare("SELECT value FROM service_settings WHERE key = ?").bind("rate_salt").first<{ value: string }>();
  }
  if (!row) throw new Error("D1 rate settings unavailable");
  saltCache.set(db, row.value);
  return row.value;
}
async function rateLimit(request: Request, db: D1Database, env: Env, action: "start" | "finish" | "verify" | "board", now: number): Promise<void> {
  const windowMs = 60_000;
  const bucket = Math.floor(now / windowMs);
  const bucketEnds = (bucket + 1) * windowMs;
  // Cloudflare overwrites this metadata at the edge. Without edge metadata,
  // requests share an anonymous bucket; identity headers are never trusted.
  const network = request.headers.get("CF-Connecting-IP") || "unknown-network";
  const key = await digest(`${await rateSalt(db, env)}\u0000${network}\u0000${action}\u0000${bucket}`);
  const maximum = action === "start" ? 12 : action === "finish" ? 18 : action === "verify" ? 6 : 120;
  const deny = (): never => {
    if (!blockedRates.has(key) && blockedRates.size >= BLOCKED_CACHE_LIMIT) blockedRates.delete(blockedRates.keys().next().value!);
    blockedRates.set(key, bucketEnds);
    throw new ApiError(429, "rate_limited", "Please wait a moment before trying again.", Math.ceil((bucketEnds - now) / 1000));
  };
  if ((blockedRates.get(key) ?? 0) > now) deny();
  // A blocked source performs no further writes. The bounded isolate cache
  // also avoids repeated reads; the conditional upsert covers concurrent
  // requests which both observed a counter below the cap.
  const current = await db.prepare("SELECT count FROM rate_limits WHERE key = ?").bind(key).first<{ count: number }>();
  if (current && current.count >= maximum) deny();
  const result = successful(await db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count").bind(key, bucketEnds + 3_600_000, maximum).all<{ count: number }>());
  if (!result.results?.length) deny();
}
function serializeEntry(row: ScoreRow, rank: number | null): LeaderboardEntry {
  return { rank, initials: row.initials, score: row.score, runId: row.run_id, finishedAt: new Date(row.finished_at).toISOString(), verified: true, ruleset: row.ruleset };
}
function method(request: Request, expected: string): void {
  if (request.method !== expected) throw new ApiError(405, "method_not_allowed", `Use ${expected} for this endpoint.`);
}
interface CachedBoard { expiresAt: number; body: string }
const boardCaches = new WeakMap<D1Database, Map<string, CachedBoard>>();
const BOARD_CACHE_ENTRIES = 256;
function boardCache(db: D1Database): Map<string, CachedBoard> {
  let cache = boardCaches.get(db);
  if (!cache) { cache = new Map(); boardCaches.set(db, cache); }
  return cache;
}
async function leaderboard(request: Request, url: URL, db: D1Database, env: Env, now: number): Promise<Response> {
  method(request, "GET");
  for (const name of url.searchParams.keys()) {
    if (!["game", "scope", "limit", "day", "ruleset"].includes(name) || url.searchParams.getAll(name).length !== 1)
      throw new ApiError(400, "invalid_query", "Unsupported or repeated leaderboard query parameter.");
  }
  const game = gameId(url.searchParams.get("game"));
  // Omitted filter preserves the original archive API. Current clients explicitly
  // select their ruleset so changed scoring is never silently ranked together.
  const ruleset = url.searchParams.get("ruleset") ?? "all";
  if (!["all", "after-hours-v1", "after-hours-v2", RULESET_VERSION].includes(ruleset))
    throw new ApiError(400, "invalid_ruleset", "Choose the current ruleset or a historical board.");
  const scope = url.searchParams.get("scope") ?? "all";
  if (scope !== "all" && scope !== "daily") throw new ApiError(400, "invalid_scope", "scope must be all or daily.");
  const limitText = url.searchParams.get("limit") ?? "20";
  if (!/^\d{1,3}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 100)
    throw new ApiError(400, "invalid_limit", "limit must be an integer from 1 to 100.");
  const today = new Date(now).toISOString().slice(0, 10);
  const day = url.searchParams.get("day") ?? today;
  if ((scope === "all" && url.searchParams.has("day")) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T00:00:00Z`)) || new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day || day > today)
    throw new ApiError(400, "invalid_day", "Use a valid UTC date up to today with the daily board.");
  // Identical boards are served from a short-lived isolate cache: repeated polls
  // cost no D1 reads or rate-limit writes.
  const cache = boardCache(db);
  const cacheKey = `${game}|${scope}|${day}|${limitText}|${ruleset}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return new Response(cached.body, { status: 200, headers: JSON_HEADERS });
  await rateLimit(request, db, env, "board", now);
  const store = storeForGame(game);
  const where = `game = ?${scope === "daily" ? " AND finished_day = ?" : ""}${ruleset === "all" ? "" : " AND ruleset = ?"}`;
  const values = [game, ...(scope === "daily" ? [day] : []), ...(ruleset === "all" ? [] : [ruleset]), Number(limitText)];
  const query = db.prepare(`SELECT run_id, initials, score, finished_at, ruleset FROM ${store.scores} WHERE ${where} ORDER BY score DESC, finished_at ASC, run_id ASC LIMIT ?`).bind(...values);
  const rows = successful(await query.all<ScoreRow>()).results ?? [];
  const body = JSON.stringify({ game, scope, ruleset, ...(scope === "daily" ? { day } : {}), entries: rows.map((row, index) => serializeEntry(row, index + 1)), updatedAt: new Date(now).toISOString() });
  if (!cache.has(cacheKey) && cache.size >= BOARD_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, { expiresAt: now + BOARD_CACHE_SECONDS * 1000, body });
  if (shouldSweep()) await pruneExpired(db, now).catch(() => {});
  return new Response(body, { status: 200, headers: JSON_HEADERS });
}
async function startRun(request: Request, db: D1Database, env: Env, clock: () => number): Promise<Response> {
  method(request, "POST");
  await rateLimit(request, db, env, "start", clock());
  const body = await readJson(request);
  fields(body, ["game", "ruleset"]);
  const game = gameId(body.game);
  if (body.ruleset !== RULESET_VERSION) throw new ApiError(409, "ruleset_mismatch", "Reload the arcade to use the current ranked ruleset.");
  const runId = crypto.randomUUID();
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  // A slow request-body upload must not count as time playing an unknown seed.
  const issuedAt = clock();
  const expiresAt = issuedAt + RUN_LIFETIME_MS;
  const store = storeForGame(game);
  await execute(db.prepare(`INSERT INTO ${store.runs} (id, game, ruleset, seed, issued_at, expires_at, status) VALUES (?, ?, ?, ?, ?, ?, 'issued')`).bind(runId, game, RULESET_VERSION, seed, issuedAt, expiresAt));
  if (shouldSweep()) await pruneExpired(db, issuedAt).catch(() => {});
  return json({ runId, seed, game, ruleset: RULESET_VERSION, ...runLimits(game), expiresAt: new Date(expiresAt).toISOString() }, 201);
}
const pruneRunsSql = (store: Store): string =>
  // Partial index excludes permanent accepted history; each sweep handles at most
  // PRUNE_BATCH abandoned tickets, independent of the accepted row count.
  `DELETE FROM ${store.runs} WHERE id IN (SELECT id FROM ${store.runs} INDEXED BY ${store.pendingExpiryIndex} WHERE status != 'accepted' AND expires_at < ? ORDER BY expires_at LIMIT ${PRUNE_BATCH}) AND NOT EXISTS (SELECT 1 FROM ${store.scores} WHERE ${store.scores}.run_id = ${store.runs}.id)`;
/** Deletes one bounded batch of expired counters and abandoned tickets; returns rows removed. */
export async function pruneExpired(db: D1Database, now: number): Promise<number> {
  const results = await batch(db, [
    db.prepare(`DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at < ? ORDER BY expires_at LIMIT ${PRUNE_BATCH})`).bind(now),
    db.prepare(pruneRunsSql(legacyStore)).bind(now),
    db.prepare(pruneRunsSql(cabinetStore)).bind(now),
  ]);
  return results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
}
/** Scheduled cleanup: drains expired rows in bounded batches so read-only traffic cannot grow the tables. */
export async function sweepExpired(db: D1Database, now: number, maxBatches = 20): Promise<number> {
  let total = 0;
  for (let index = 0; index < maxBatches; index++) {
    const removed = await pruneExpired(db, now);
    total += removed;
    if (removed === 0) break;
  }
  return total;
}
async function acceptedRow(db: D1Database, store: Store, runId: string): Promise<AcceptedScoreRow | null> {
  return db.prepare(`SELECT run_id, initials, score, frames, finished_at, replay_hash, ruleset FROM ${store.scores} WHERE run_id = ?`).bind(runId).first<AcceptedScoreRow>();
}
async function boundedRank(db: D1Database, store: Store, game: GameId, ruleset: string, runId: string): Promise<number | null> {
  try {
    const rows = successful(await db.prepare(`SELECT run_id FROM ${store.scores} WHERE game = ? AND ruleset = ? ORDER BY score DESC, finished_at ASC, run_id ASC LIMIT 100`).bind(game, ruleset).all<{ run_id: string }>()).results ?? [];
    const position = rows.findIndex((row) => row.run_id === runId);
    return position < 0 ? null : position + 1;
  } catch {
    // Ranking is optional metadata. A failed rank read must not turn a durable
    // accepted score into a reported submission failure.
    return null;
  }
}
async function replayDigest(run: RunRow, frames: number, inputs: unknown): Promise<string> {
  return digest(JSON.stringify({ ruleset: run.ruleset, game: run.game, seed: run.seed, frames, inputs }));
}
async function recoveredResponse(db: D1Database, store: Store, run: RunRow, body: JsonObject, row: AcceptedScoreRow): Promise<Response> {
  const initials = validateInitials(body.initials);
  const replay = validateReplay(run.game, body.frames, body.inputs);
  const replayHash = await replayDigest(run, replay.frames, replay.inputs);
  if (initials !== row.initials || replay.frames !== row.frames || replayHash !== row.replay_hash || (body.score !== undefined && body.score !== row.score))
    throw new ApiError(409, "run_already_submitted", "This run was already accepted with a different submission.");
  return json({ accepted: true, entry: serializeEntry(row, await boundedRank(db, store, run.game, run.ruleset, run.id)), score: row.score, verified: true, replayed: true });
}
async function releaseClaim(db: D1Database, store: Store, runId: string, token: string): Promise<void> {
  await execute(db.prepare(`UPDATE ${store.runs} SET status = 'issued', claim_token = NULL, claim_expires_at = NULL WHERE id = ? AND status = 'verifying' AND claim_token = ? AND NOT EXISTS (SELECT 1 FROM ${store.scores} WHERE ${store.scores}.run_id = ${store.runs}.id)`).bind(runId, token));
}
async function finishRun(request: Request, runId: string, db: D1Database, env: Env, clock: () => number): Promise<Response> {
  method(request, "POST");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) throw new ApiError(404, "run_not_found", "Ranked run not found.");
  await rateLimit(request, db, env, "finish", clock());
  const body = await readJson(request);
  fields(body, ["initials", "frames", "inputs", "score"]);
  const now = clock();
  const lookup = (store: Store): string => `SELECT id, game, ruleset, seed, issued_at, expires_at, status, claim_token, claim_expires_at FROM ${store.runs} WHERE id = ?`;
  let store = legacyStore;
  let run = await db.prepare(lookup(store)).bind(runId).first<RunRow>();
  if (!run) {
    run = await db.prepare(lookup(cabinetStore)).bind(runId).first<RunRow>();
    if (run) store = cabinetStore;
  }
  if (!run) throw new ApiError(404, "run_not_found", "Ranked run not found.");
  if (run.status === "accepted") {
    const row = await acceptedRow(db, store, runId);
    if (!row) throw new Error("Accepted score unavailable");
    return recoveredResponse(db, store, run, body, row);
  }
  if (run.status === "rejected") throw new ApiError(409, "run_already_submitted", "This run has already been rejected.");
  if (now >= run.expires_at) throw new ApiError(410, "run_expired", "This ranked run has expired. Start a new game.");
  if (run.ruleset !== RULESET_VERSION) throw new ApiError(409, "ruleset_mismatch", "This run started before the arcade upgrade and cannot be ranked under the new rules. Your local best is safe. Reload the arcade and start a new ranked run.");
  // Guest labels may be corrected without consuming the replay ticket.
  const initials = validateInitials(body.initials);
  const { tickRate } = runLimits(run.game);
  if (Number.isInteger(body.frames) && (body.frames as number) >= 1 && (body.frames as number) <= runLimits(run.game).maxTicks && now - run.issued_at + CLOCK_TOLERANCE_MS < (body.frames as number) * 1000 / tickRate)
    throw new ApiError(409, "too_early", "The ranked run has not had enough time to complete.", Math.ceil(((body.frames as number) * 1000 / tickRate - (now - run.issued_at) - CLOCK_TOLERANCE_MS) / 1000));
  if (run.status === "verifying" && run.claim_expires_at !== null && run.claim_expires_at > now)
    throw new ApiError(409, "run_in_progress", "This run is being verified. Retry the same submission shortly.", Math.ceil((run.claim_expires_at - now) / 1000));
  // Replay verification is the expensive step, so it has its own tighter budget,
  // charged before a claim is taken and only for submissions that reach it.
  await rateLimit(request, db, env, "verify", now);
  const token = crypto.randomUUID();
  const claim = await execute(db.prepare(`UPDATE ${store.runs} SET status = 'verifying', claim_token = ?, claim_expires_at = ? WHERE id = ? AND expires_at > ? AND (status = 'issued' OR (status = 'verifying' AND (claim_expires_at IS NULL OR claim_expires_at <= ?)))`).bind(token, now + CLAIM_LEASE_MS, runId, now, now));
  if (claim.meta.changes !== 1) {
    const row = await acceptedRow(db, store, runId);
    if (row) return recoveredResponse(db, store, run, body, row);
    throw new ApiError(409, "run_in_progress", "This run is being verified. Retry the same submission shortly.", 1);
  }
  let score: number;
  let frames: number;
  let replayHash: string;
  try {
    const replay = validateReplay(run.game, body.frames, body.inputs);
    frames = replay.frames;
    if (body.score !== undefined && (!Number.isSafeInteger(body.score) || (body.score as number) < 0 || (body.score as number) > MAX_SCORE))
      throw new ApiError(400, "invalid_score", "A claimed score must be a nonnegative safe integer.");
    score = replayScore(run.game, run.seed, frames, replay.inputs);
    if (body.score !== undefined && body.score !== score) throw new ApiError(422, "score_mismatch", "The submitted score does not match this replay.");
    replayHash = await replayDigest(run, frames, replay.inputs);
  } catch (error) {
    if (error instanceof ApiError) {
      await execute(db.prepare(`UPDATE ${store.runs} SET status = 'rejected', claim_token = NULL, claim_expires_at = NULL WHERE id = ? AND status = 'verifying' AND claim_token = ? AND NOT EXISTS (SELECT 1 FROM ${store.scores} WHERE ${store.scores}.run_id = ${store.runs}.id)`).bind(runId, token));
    } else {
      await releaseClaim(db, store, runId, token).catch(() => {});
    }
    throw error;
  }
  const finishedAt = clock();
  const day = new Date(finishedAt).toISOString().slice(0, 10);
  try {
    // Both writes are transactional and token-guarded: an expired verifier
    // cannot commit after another request has acquired the recovered claim.
    const committed = await batch(db, [
      db.prepare(`INSERT INTO ${store.scores} (run_id, game, ruleset, initials, score, frames, finished_at, finished_day, replay_hash) SELECT id, game, ruleset, ?, ?, ?, ?, ?, ? FROM ${store.runs} WHERE id = ? AND status = 'verifying' AND claim_token = ?`).bind(initials, score, frames, finishedAt, day, replayHash, runId, token),
      db.prepare(`UPDATE ${store.runs} SET status = 'accepted', claim_token = NULL, claim_expires_at = NULL WHERE id = ? AND status = 'verifying' AND claim_token = ? AND EXISTS (SELECT 1 FROM ${store.scores} WHERE ${store.scores}.run_id = ${store.runs}.id)`).bind(runId, token),
    ]);
    boardCaches.delete(db);
    if (committed[0]?.meta.changes !== 1 || committed[1]?.meta.changes !== 1) {
      const row = await acceptedRow(db, store, runId);
      if (row) return recoveredResponse(db, store, run, body, row);
      throw new ApiError(409, "run_in_progress", "A newer verifier owns this run. Retry shortly.", 1);
    }
  } catch (error) {
    // This also handles an ambiguous transport error after COMMIT: do not
    // reset an accepted run, and return its durable result when readable.
    await releaseClaim(db, store, runId, token).catch(() => {});
    const row = await acceptedRow(db, store, runId).catch(() => null);
    if (row) return recoveredResponse(db, store, run, body, row);
    throw error;
  }
  return json({ accepted: true, entry: serializeEntry({ run_id: runId, initials, score, finished_at: finishedAt, ruleset: run.ruleset }, await boundedRank(db, store, run.game, run.ruleset, runId)), score, verified: true });
}

// The game is fully self-hosted: no third-party scripts, styles, fonts or frames.
// The preserved offline Pac-Man page inlines its own bundle, so it alone needs inline scripts.
const CSP_BASE = "default-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self'; frame-ancestors 'self'; worker-src 'none'";
export const CSP_ARCADE = `${CSP_BASE}; script-src 'self'; style-src 'self' 'unsafe-inline'`;
export const CSP_PACMAN = `${CSP_BASE}; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'`;
function withSecurityHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", pathname === "/pacman.html" ? CSP_PACMAN : CSP_ARCADE);
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export async function handleRequest(request: Request, env: Env, clock: () => number = () => Date.now()): Promise<Response> {
  return withSecurityHeaders(await route(request, env, clock), new URL(request.url).pathname);
}
async function route(request: Request, env: Env, clock: () => number): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Arcade assets are not configured.", { status: 404 });
  }
  try {
    sameOrigin(request, url);
    if (url.pathname === "/api/health") {
      method(request, "GET");
      if (!env.DB) return json({ ok: false, database: "unconfigured", ruleset: RULESET_VERSION }, 503);
      const now = clock();
      const cached = healthCache.get(env.DB);
      if (cached && now >= cached.checkedAt && now - cached.checkedAt < HEALTH_CACHE_MS)
        return json({ ok: cached.connected, database: cached.connected ? "recently_connected" : "unavailable", ruleset: RULESET_VERSION, checkedAt: new Date(cached.checkedAt).toISOString(), cached: true }, cached.connected ? 200 : 503);
      try {
        await env.DB.prepare("SELECT (SELECT claim_token FROM runs INDEXED BY runs_pending_expiry_idx WHERE status != 'accepted' LIMIT 1) AS claim_token, (SELECT claim_expires_at FROM runs LIMIT 1) AS claim_expires_at, (SELECT key FROM service_settings LIMIT 1) AS settings_key, (SELECT run_id FROM scores LIMIT 1) AS score_id, (SELECT key FROM rate_limits LIMIT 1) AS counter_key, (SELECT id FROM cabinet_runs LIMIT 1) AS cabinet_run_id, (SELECT run_id FROM cabinet_scores LIMIT 1) AS cabinet_score_id").all().then(successful);
        healthCache.set(env.DB, { checkedAt: now, connected: true });
        return json({ ok: true, database: "connected", ruleset: RULESET_VERSION, checkedAt: new Date(now).toISOString(), cached: false });
      } catch {
        healthCache.set(env.DB, { checkedAt: now, connected: false });
        return json({ ok: false, database: "unavailable", ruleset: RULESET_VERSION, checkedAt: new Date(now).toISOString(), cached: false }, 503);
      }
    }
    const db = dbOrThrow(env);
    const now = clock();
    if (url.pathname === "/api/leaderboards") return await leaderboard(request, url, db, env, now);
    if (url.pathname === "/api/runs") return await startRun(request, db, env, clock);
    const finish = /^\/api\/runs\/([^/]+)\/finish$/.exec(url.pathname);
    if (finish) return await finishRun(request, finish[1], db, env, clock);
    throw new ApiError(404, "not_found", "API endpoint not found.");
  } catch (error) {
    if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message } }, error.status, error.retryAfter === undefined ? undefined : { "Retry-After": String(Math.max(1, error.retryAfter)) });
    // Deliberately do not log request bodies, network metadata or DB errors.
    if (url.pathname === "/api/health") return json({ ok: false, database: "unavailable", ruleset: RULESET_VERSION }, 503);
    return json({ error: { code: "database_unavailable", message: "Global leaderboards are temporarily unavailable. Please try again later." } }, 503);
  }
}
