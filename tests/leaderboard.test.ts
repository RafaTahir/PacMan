import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleRequest, MAX_BODY_BYTES, pruneExpired } from "../server/app";
import worker from "../server/index";
import type { D1Database, D1Result, D1Statement, Env, SqlValue } from "../server/d1";
import { replayScore, runLimits, validateReplay } from "../server/replay";
import { validateInitials } from "../server/initials";
import { GAME_IDS, NEUTRAL_INPUT, RULESET_VERSION, type ArcadeInput, type GameId, type ReplayInput } from "../src/arcade/shared/contracts";
import { createSimulation as rally } from "../src/arcade/games/neon-rally/model";
import { createSimulation as breaker } from "../src/arcade/games/reactor-breaker/model";
import { createSimulation as siege } from "../src/arcade/games/chrome-siege/model";
import { createSimulation as pinball } from "../src/arcade/games/midnight-pinball/model";
import { Game } from "../src/engine";
import { TICK_SECONDS } from "../src/levels";

class SQLiteD1 implements D1Database {
  readonly sqlite: DatabaseSync;
  readonly statements: string[] = [];
  failNext: { pattern: RegExp; operation: "first" | "all" | "run" }[] = [];
  acceptanceBatchFailure: "before" | "after" | null = null;
  beforeAcceptanceBatch?: () => void;
  beforeAll?: (sql: string) => void;
  maybeFail(sql: string, operation: "first" | "all" | "run"): void {
    const index = this.failNext.findIndex((fault) => fault.operation === operation && fault.pattern.test(sql));
    if (index >= 0) { this.failNext.splice(index, 1); throw new Error("Injected transient D1 failure"); }
  }
  constructor(filename = ":memory:", migrate = true) {
    this.sqlite = new DatabaseSync(filename);
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    if (migrate) {
      for (const file of readdirSync("drizzle").filter((name) => name.endsWith(".sql")).sort())
        this.sqlite.exec(readFileSync(join("drizzle", file), "utf8"));
    }
  }
  prepare(sql: string): D1Statement {
    // Runtime adapter deliberately rejects batching SQL text and request DDL.
    if (sql.includes(";") || /\b(CREATE|ALTER|DROP)\b/i.test(sql)) throw new Error("Only one non-DDL statement is allowed per prepare");
    this.statements.push(sql);
    return new SQLiteStatement(this, sql);
  }
  async batch<T>(statements: D1Statement[]): Promise<D1Result<T>[]> {
    const acceptance = statements.some((statement) => statement instanceof SQLiteStatement && statement.sql.startsWith("INSERT INTO scores"));
    const failure = acceptance ? this.acceptanceBatchFailure : null;
    if (acceptance) {
      this.acceptanceBatchFailure = null;
      this.beforeAcceptanceBatch?.();
      this.beforeAcceptanceBatch = undefined;
    }
    if (failure === "before") throw new Error("Injected acceptance failure before commit");
    this.sqlite.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      const results: D1Result<T>[] = [];
      for (const statement of statements) results.push(await statement.run<T>());
      this.sqlite.exec("COMMIT");
      committed = true;
      if (failure === "after") throw new Error("Injected response failure after commit");
      return results;
    } catch (error) { if (!committed) this.sqlite.exec("ROLLBACK"); throw error; }
  }
  close(): void { this.sqlite.close(); }
}
class SQLiteStatement implements D1Statement {
  constructor(private db: SQLiteD1, readonly sql: string, private values: SqlValue[] = []) {}
  bind(...values: SqlValue[]): D1Statement { return new SQLiteStatement(this.db, this.sql, values); }
  async first<T>(): Promise<T | null> { this.db.maybeFail(this.sql, "first"); return this.db.sqlite.prepare(this.sql).get(...this.values) as T ?? null; }
  async all<T>(): Promise<D1Result<T>> {
    this.db.beforeAll?.(this.sql);
    this.db.maybeFail(this.sql, "all");
    const rows = this.db.sqlite.prepare(this.sql).all(...this.values) as T[];
    return { success: true, results: rows, meta: {} };
  }
  async run<T>(): Promise<D1Result<T>> {
    this.db.maybeFail(this.sql, "run");
    const result = this.db.sqlite.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

const ORIGIN = "https://arcade.example";
let clock = Date.parse("2026-10-25T12:00:00.000Z");
let db: SQLiteD1;
let env: Env;
let tempDirectories: string[] = [];
function request(path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return handleRequest(new Request(`${ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env);
}
async function bodyOf(response: Response): Promise<any> { return response.json(); }
async function start(game: GameId = "pacman", headers: Record<string, string> = {}): Promise<any> {
  const response = await request("/api/runs", { game, ruleset: RULESET_VERSION }, headers);
  expect(response.status).toBe(201);
  return bodyOf(response);
}
function completed(game: GameId, seed: number, input: ArcadeInput = { ...NEUTRAL_INPUT }): { frames: number; inputs: ReplayInput[]; score: number } {
  const inputs: ReplayInput[] = Object.keys(NEUTRAL_INPUT).some((key) => input[key as keyof ArcadeInput] !== NEUTRAL_INPUT[key as keyof ArcadeInput])
    ? [[0, input.x, input.y, input.aimX, input.aimY, input.buttons]] : [];
  let frames = 0;
  let score = 0;
  if (game === "pacman") {
    const simulation = new Game({ seed });
    simulation.start();
    if (input.x < 0) simulation.input("left");
    else if (input.x > 0) simulation.input("right");
    else if (input.y < 0) simulation.input("up");
    else if (input.y > 0) simulation.input("down");
    while (frames < runLimits(game).maxTicks && simulation.state.phase !== "game-over") { simulation.update(TICK_SECONDS); simulation.drainEvents(); frames++; }
    score = simulation.state.score;
  } else {
    const simulation = { "neon-rally": rally, "reactor-breaker": breaker, "chrome-siege": siege, "midnight-pinball": pinball }[game](seed);
    while (frames < runLimits(game).maxTicks && simulation.state.status === "playing") { simulation.step(input); frames++; }
    score = simulation.state.score;
  }
  return { frames, inputs, score };
}
async function finish(run: any, initials = "ACE", replay = completed(run.game, run.seed)): Promise<Response> {
  clock += replay.frames * 1000 / run.tickRate + 10;
  return request(`/api/runs/${run.runId}/finish`, { initials, ...replay });
}

beforeEach(() => {
  clock = Date.parse("2026-10-25T12:00:00.000Z");
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  db = new SQLiteD1();
  env = { DB: db };
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  for (const directory of tempDirectories) rmSync(directory, { recursive: true, force: true });
  tempDirectories = [];
});

describe("persistent D1 leaderboards", () => {
  it("adapts the real Worker third ExecutionContext argument without treating it as an injected clock", async () => {
    const fetch = worker.fetch as (request: Request, env: Env, context: unknown) => Promise<Response>;
    const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    const health = await fetch(new Request(`${ORIGIN}/api/health`), env, context);
    expect(health.status).toBe(200);
    expect(await bodyOf(health)).toMatchObject({ ok: true, database: "connected" });
    const response = await fetch(new Request(`${ORIGIN}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ game: "pacman", ruleset: RULESET_VERSION }) }), env, context);
    expect(response.status).toBe(201);
    expect((await bodyOf(response)).game).toBe("pacman");
  });
  it("reports actual configuration and migration availability", async () => {
    expect(await bodyOf(await request("/api/health"))).toMatchObject({ ok: true, database: "connected", ruleset: RULESET_VERSION, cached: false });
    env = {};
    expect((await request("/api/health")).status).toBe(503);
    expect((await request("/api/leaderboards?game=pacman")).status).toBe(503);
    env = { DB: new SQLiteD1(":memory:", false) };
    expect((await request("/api/health")).status).toBe(503);
    expect((await request("/api/leaderboards?game=pacman")).status).toBe(503);
    (env.DB as SQLiteD1).close();
  });
  it("shows empty boards before actual accepted runs, with no synthetic competitors", async () => {
    for (const game of GAME_IDS) {
      const board = await bodyOf(await request(`/api/leaderboards?game=${game}&scope=all&limit=20`));
      expect(board).toMatchObject({ game, scope: "all", entries: [] });
    }
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(0);
  });
  it.each(GAME_IDS)("accepts and persists a model-derived ranked %s score", async (game) => {
    const run = await start(game);
    expect(run).toMatchObject({ game, ruleset: RULESET_VERSION, ...runLimits(game) });
    expect(run.seed).toBeGreaterThan(0);
    const response = await finish(run);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(200);
    const result = await bodyOf(response);
    expect(result).toMatchObject({ accepted: true, verified: true, entry: { initials: "ACE", verified: true, runId: run.runId, rank: 1 } });
    expect(Number.isInteger(result.score)).toBe(true);
    const board = await bodyOf(await request(`/api/leaderboards?game=${game}`));
    expect(board.entries).toEqual([result.entry]);
    expect(db.sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(run.runId)?.status).toBe("accepted");
    expect(db.statements.every((sql) => !sql.includes(";") && !/\bCREATE\b/i.test(sql))).toBe(true);
  });
  it("keeps duplicate guest initials and ranks actual scores with deterministic ties", async () => {
    const entries: any[] = [];
    for (let n = 0; n < 2; n++) { const run = await start("reactor-breaker"); entries.push(await bodyOf(await finish(run, "ACE"))); }
    const board = await bodyOf(await request("/api/leaderboards?game=reactor-breaker&limit=20"));
    expect(board.entries).toHaveLength(2);
    expect(board.entries.map((entry: any) => entry.initials)).toEqual(["ACE", "ACE"]);
    expect(board.entries.map((entry: any) => entry.rank)).toEqual([1, 2]);
    expect(board.entries[0].finishedAt <= board.entries[1].finishedAt).toBe(true);
    expect(new Set(board.entries.map((entry: any) => entry.runId)).size).toBe(2);
  });
  it("uses UTC daily boards while all-time scores survive database restart and calendar changes", async () => {
    db.close();
    const directory = mkdtempSync(join(tmpdir(), "arcade-d1-test-"));
    tempDirectories.push(directory);
    const filename = join(directory, "persistent.sqlite");
    db = new SQLiteD1(filename);
    env = { DB: db };
    const run = await start();
    const accepted = await bodyOf(await finish(run));
    const oldDay = new Date(clock).toISOString().slice(0, 10);
    db.close();
    db = new SQLiteD1(filename, false);
    env = { DB: db };
    clock += 40 * 24 * 60 * 60 * 1000;
    expect((await bodyOf(await request("/api/leaderboards?game=pacman&scope=all"))).entries).toEqual([accepted.entry]);
    expect((await bodyOf(await request("/api/leaderboards?game=pacman&scope=daily"))).entries).toEqual([]);
    expect((await bodyOf(await request(`/api/leaderboards?game=pacman&scope=daily&day=${oldDay}`))).entries).toEqual([accepted.entry]);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("allows correcting moderated guest initials before claiming the replay", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    clock += replay.frames * 1000 / run.tickRate;
    const rejectedLabel = await request(`/api/runs/${run.runId}/finish`, { initials: "ASS", ...replay });
    expect(rejectedLabel.status).toBe(400);
    expect((await bodyOf(rejectedLabel)).error.code).toBe("blocked_initials");
    expect(db.sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(run.runId)?.status).toBe("issued");
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay })).status).toBe(200);
  });
  it("rejects score forgery and permanently rejects the failed run", async () => {
    const run = await start();
    const replay = completed(run.game, run.seed);
    clock += replay.frames * 1000 / run.tickRate;
    const response = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay, score: replay.score + 999999 });
    expect(response.status).toBe(422);
    expect((await bodyOf(response)).error.code).toBe("score_mismatch");
    expect(db.sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(run.runId)?.status).toBe("rejected");
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay })).status).toBe(409);
    expect((await bodyOf(await request("/api/leaderboards?game=pacman"))).entries).toEqual([]);
  });
  it("does not accept an abbreviated game, fabricated seed or stale ruleset", async () => {
    expect((await request("/api/runs", { game: "pacman", ruleset: "old" })).status).toBe(409);
    expect((await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION, seed: 1 })).status).toBe(400);
    const run = await start();
    clock += 10000;
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", frames: 10, inputs: [] })).status).toBe(400);
    const other = await start();
    expect((await request(`/api/runs/${other.runId}/finish`, { initials: "ACE", frames: 10, inputs: [], seed: other.seed + 1 })).status).toBe(400);
  });
  it("rejects unknown/expired tickets and protects concurrent finishes while permitting identical retries", async () => {
    expect((await request("/api/runs/invalid/finish", { initials: "ACE", frames: 1, inputs: [] })).status).toBe(404);
    expect((await request(`/api/runs/${crypto.randomUUID()}/finish`, { initials: "ACE", frames: 1, inputs: [] })).status).toBe(404);
    const expired = await start();
    clock += 20 * 60 * 1000 + 1;
    expect((await request(`/api/runs/${expired.runId}/finish`, { initials: "ACE", ...completed(expired.game, expired.seed) })).status).toBe(410);
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    clock += replay.frames * 1000 / run.tickRate;
    const results = await Promise.all([request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay }), request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay })]);
    expect(results.some((response) => response.status === 200)).toBe(true);
    expect(results.every((response) => [200, 409].includes(response.status))).toBe(true);
    const retry = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay });
    expect(retry.status).toBe(200);
    expect(await bodyOf(retry)).toMatchObject({ accepted: true, replayed: true, score: replay.score });
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "XYZ", ...replay })).status).toBe(409);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("enforces real elapsed time and allows a later retry of an early finish", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    const early = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay });
    expect(early.status).toBe(409);
    expect((await bodyOf(early)).error.code).toBe("too_early");
    expect(Number(early.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await finish(run, "ACE", replay)).status).toBe(200);
  });
  it.each([NaN, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, "999"])("rejects invalid claimed score %s", async (score) => {
    const run = await start();
    const replay = completed(run.game, run.seed);
    clock += replay.frames * 1000 / run.tickRate;
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay, score })).status).toBe(400);
  });
  it("stores salted network digests only and limits starts without trusting identity headers", async () => {
    const headers = { "CF-Connecting-IP": "192.0.2.19", "X-User-ID": "forged", "X-Google-User": "forged@example.org" };
    for (let index = 0; index < 12; index++) await start("pacman", headers);
    const limited = await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION }, headers);
    expect(limited.status).toBe(429);
    const rows = db.sqlite.prepare("SELECT key, count FROM rate_limits").all();
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(12);
    expect(rows.every((row) => /^[a-f0-9]{64}$/.test(String(row.key)))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("192.0.2.19");
    clock += 60000;
    expect((await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION }, headers)).status).toBe(201);
  });
  it("releases a valid ticket after a rolled-back acceptance batch and accepts its identical retry", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    db.acceptanceBatchFailure = "before";
    expect((await finish(run, "ACE", replay)).status).toBe(503);
    expect(db.sqlite.prepare("SELECT status, claim_token FROM runs WHERE id = ?").get(run.runId)).toMatchObject({ status: "issued", claim_token: null });
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay })).status).toBe(200);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("recovers a committed acceptance whose batch transport reported failure", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    db.acceptanceBatchFailure = "after";
    const response = await finish(run, "ACE", replay);
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toMatchObject({ accepted: true, replayed: true });
    expect(db.sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(run.runId)?.status).toBe("accepted");
    const retry = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay });
    expect(retry.status).toBe(200);
    expect((await bodyOf(retry)).replayed).toBe(true);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("recovers a persisted score on retry when the response and recovery lookup both failed after commit", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    db.acceptanceBatchFailure = "after";
    db.failNext.push({ pattern: /^SELECT run_id, initials, score, frames/, operation: "first" });
    expect((await finish(run, "ACE", replay)).status).toBe(503);
    const retry = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay });
    expect(retry.status).toBe(200);
    expect(await bodyOf(retry)).toMatchObject({ accepted: true, replayed: true, score: replay.score });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("returns accepted with null rank when the optional ranking query fails", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    db.failNext.push({ pattern: /^SELECT run_id FROM scores/, operation: "all" });
    const response = await finish(run, "ACE", replay);
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toMatchObject({ accepted: true, entry: { rank: null } });
    const retry = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay });
    expect(retry.status).toBe(200);
    expect((await bodyOf(retry)).entry.rank).toBe(1);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("recovers an interrupted verifier after its lease expires, even if release failed", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    db.acceptanceBatchFailure = "before";
    db.failNext.push({ pattern: /^UPDATE runs SET status = 'issued'/, operation: "run" });
    expect((await finish(run, "ACE", replay)).status).toBe(503);
    expect(db.sqlite.prepare("SELECT status FROM runs WHERE id = ?").get(run.runId)?.status).toBe("verifying");
    const inProgress = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay });
    expect(inProgress.status).toBe(409);
    expect((await bodyOf(inProgress)).error.code).toBe("run_in_progress");
    clock += 30_001;
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay })).status).toBe(200);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("guards acceptance with the exact claim token so a superseded verifier cannot commit", async () => {
    const run = await start("reactor-breaker");
    const replay = completed(run.game, run.seed);
    db.beforeAcceptanceBatch = () => {
      db.sqlite.prepare("UPDATE runs SET claim_token = ?, claim_expires_at = ? WHERE id = ?").run("newer-owner", clock + 30_000, run.runId);
    };
    const superseded = await finish(run, "ACE", replay);
    expect(superseded.status).toBe(409);
    expect(db.sqlite.prepare("SELECT claim_token, status FROM runs WHERE id = ?").get(run.runId)).toMatchObject({ claim_token: "newer-owner", status: "verifying" });
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(0);
    clock += 30_001;
    expect((await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", ...replay })).status).toBe(200);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(1);
  });
  it("stamps run issuance after a slow body upload so an unknown seed cannot accrue play time", async () => {
    let releaseBody!: () => void;
    const bodyGate = new Promise<void>((resolve) => { releaseBody = resolve; });
    const encoded = new TextEncoder().encode(JSON.stringify({ game: "reactor-breaker", ruleset: RULESET_VERSION }));
    const stream = new ReadableStream<Uint8Array>({ async pull(controller) { await bodyGate; controller.enqueue(encoded); controller.close(); } });
    const pending = handleRequest(new Request(`${ORIGIN}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: stream, duplex: "half" } as RequestInit & { duplex: string }), env, () => clock);
    await new Promise((resolve) => setTimeout(resolve, 0));
    clock += 120_000;
    releaseBody();
    const response = await pending;
    expect(response.status).toBe(201);
    const run = await bodyOf(response);
    expect(db.sqlite.prepare("SELECT issued_at, expires_at FROM runs WHERE id = ?").get(run.runId)).toMatchObject({ issued_at: clock, expires_at: clock + 20 * 60 * 1000 });
    const early = await request(`/api/runs/${run.runId}/finish`, { initials: "ACE", frames: 7200, inputs: [], score: 0 });
    expect(early.status).toBe(409);
    expect((await bodyOf(early)).error.code).toBe("too_early");
  });
  it("stops all further counter writes at the cap and serves repeated denials from a bounded isolate cache", async () => {
    for (let index = 0; index < 12; index++) await start();
    expect((await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION })).status).toBe(429);
    const statementsAfterCap = db.statements.length;
    const writesAfterCap = db.sqlite.prepare("SELECT total_changes() AS n").get()?.n;
    for (let index = 0; index < 50; index++) expect((await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION })).status).toBe(429);
    expect(db.statements.length).toBe(statementsAfterCap);
    expect(db.sqlite.prepare("SELECT total_changes() AS n").get()?.n).toBe(writesAfterCap);
    expect(db.sqlite.prepare("SELECT count FROM rate_limits").get()?.count).toBe(12);
  });
  it("returns 429 when a concurrent increment reaches the cap between its read and conditional upsert", async () => {
    await start();
    db.sqlite.exec("UPDATE rate_limits SET count = 11");
    db.beforeAll = (sql) => {
      if (sql.startsWith("INSERT INTO rate_limits")) {
        db.beforeAll = undefined;
        db.sqlite.exec("UPDATE rate_limits SET count = 12");
      }
    };
    const response = await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION });
    expect(response.status).toBe(429);
    expect((await bodyOf(response)).error.code).toBe("rate_limited");
    expect(db.sqlite.prepare("SELECT count FROM rate_limits").get()?.count).toBe(12);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM runs").get()?.n).toBe(1);
  });
  it("caches health probes with explicit historical status, including failed checks", async () => {
    expect(await bodyOf(await request("/api/health"))).toMatchObject({ ok: true, database: "connected", cached: false });
    const statements = db.statements.length;
    for (let index = 0; index < 20; index++) expect(await bodyOf(await request("/api/health"))).toMatchObject({ ok: true, database: "recently_connected", cached: true, checkedAt: new Date(clock).toISOString() });
    expect(db.statements.length).toBe(statements);
    clock += 10_001;
    db.failNext.push({ pattern: /^SELECT \(SELECT claim_token FROM runs/, operation: "all" });
    const failed = await request("/api/health");
    expect(failed.status).toBe(503);
    expect(await bodyOf(failed)).toMatchObject({ ok: false, database: "unavailable", cached: false });
    const afterFailure = db.statements.length;
    expect((await request("/api/health")).status).toBe(503);
    expect(db.statements.length).toBe(afterFailure);
    clock += 10_001;
    expect(await bodyOf(await request("/api/health"))).toMatchObject({ ok: true, database: "connected", cached: false });
  });
  it("bounds rank and expiry cleanup independently of ten thousand permanent accepted fixtures", async () => {
    // Explicit isolated test fixtures, never production/demo competitors.
    db.sqlite.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 10000) INSERT INTO runs (id,game,ruleset,seed,issued_at,expires_at,status) SELECT 'fixture-'||i,'reactor-breaker','after-hours-v1',1,0,1,'accepted' FROM n");
    db.sqlite.exec("INSERT INTO scores (run_id,game,ruleset,initials,score,frames,finished_at,finished_day,replay_hash) SELECT id,game,ruleset,'TST',1000,7200,1,'2026-01-01','fixture-hash' FROM runs");
    db.sqlite.exec("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 150) INSERT INTO runs (id,game,ruleset,seed,issued_at,expires_at,status) SELECT 'expired-fixture-'||i,'pacman','after-hours-v1',1,0,1,'issued' FROM n");
    await pruneExpired(db, clock);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'accepted'").get()?.n).toBe(10000);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM scores").get()?.n).toBe(10000);
    expect(db.sqlite.prepare("SELECT COUNT(*) AS n FROM runs WHERE status = 'issued'").get()?.n).toBe(50);
    const cleanupSql = db.statements.find((sql) => sql.startsWith("DELETE FROM runs"))!;
    expect(JSON.stringify(db.sqlite.prepare(`EXPLAIN QUERY PLAN ${cleanupSql}`).all(clock))).toContain("runs_pending_expiry_idx");
    const run = await start("reactor-breaker");
    const response = await finish(run);
    expect(response.status).toBe(200);
    expect((await bodyOf(response)).entry.rank).toBeNull();
    const rankSql = db.statements.find((sql) => sql.startsWith("SELECT run_id FROM scores"))!;
    expect(rankSql).toContain("LIMIT 100");
    expect(rankSql).not.toContain("COUNT");
    expect(JSON.stringify(db.sqlite.prepare(`EXPLAIN QUERY PLAN ${rankSql}`).all("reactor-breaker"))).toContain("scores_all_time_idx");
    const board = await bodyOf(await request("/api/leaderboards?game=reactor-breaker&limit=100"));
    expect(board.entries).toHaveLength(100);
    expect(board.entries[99].rank).toBe(100);
  });
  it("limits polling and finishing requests", async () => {
    for (let index = 0; index < 120; index++) expect((await request("/api/leaderboards?game=pacman")).status).toBe(200);
    expect((await request("/api/leaderboards?game=pacman")).status).toBe(429);
    for (let index = 0; index < 18; index++) expect((await request(`/api/runs/${crypto.randomUUID()}/finish`, {})).status).toBe(404);
    expect((await request(`/api/runs/${crypto.randomUUID()}/finish`, {})).status).toBe(429);
  });
});

describe("replay and API input boundaries", () => {
  it.each([
    [0, []], [7201, []], [1.2, []], [NaN, []], [10, null],
    [10, [[0, 128, 0, 0, 0, 0]]], [10, [[0, 0, -128, 0, 0, 0]]],
    [10, [[0, 0, 0, 128, 0, 0]]], [10, [[0, 0, 0, 0, 16]]],
    [10, [[-1, 0, 0, 0, 0, 0]]], [10, [[10, 0, 0, 0, 0, 0]]],
    [10, [[1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0]]],
    [10, [[0, 1, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0]]],
    [10, [[0, 1, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0]]],
    [10, [[0, 0, 0, 0, 0]]], [10, [[0, 0.2, 0, 0, 0, 0]]],
  ])("rejects malformed replay frames=%s input=%s", (frames, inputs) => {
    expect(() => validateReplay("reactor-breaker", frames, inputs)).toThrow();
  });
  it("rejects Pac-Man diagonal/button inputs, trailing frames, and a forged game score", () => {
    expect(() => validateReplay("pacman", 10, [[0, 127, 127, 0, 0, 0]])).toThrow();
    expect(() => validateReplay("pacman", 10, [[0, 127, 0, 0, 0, 1]])).toThrow();
    const replay = completed("pacman", 1234);
    if (replay.frames < runLimits("pacman").maxTicks) expect(() => replayScore("pacman", 1234, replay.frames + 1, [])).toThrow(/after the game ended/);
    expect(replayScore("pacman", 1234, replay.frames, replay.inputs)).toBe(replay.score);
  });
  it.each(["", "AB", "ABCD", "ace", "A C", "A1C", "<b>", "A\nC", "АCE", "ASS", "KKK", "FAG", null, 123])("rejects invalid/moderated initials %s", (initials) => {
    expect(() => validateInitials(initials)).toThrow();
  });
  it("permits exact A–Z guest labels including duplicates and neutral identity terms", () => {
    expect(validateInitials("ACE")).toBe("ACE");
    expect(validateInitials("ACE")).toBe("ACE");
    expect(validateInitials("GAY")).toBe("GAY");
    expect(validateInitials("JEW")).toBe("JEW");
  });
  it.each([
    "game=unknown", "game=pacman%27%3BDROP%20TABLE%20scores", "game=pacman&limit=-1", "game=pacman&limit=0", "game=pacman&limit=101", "game=pacman&limit=2.2", "game=pacman&limit=1e2", "game=pacman&scope=week", "game=pacman&scope=", "game=pacman&period=all", "game=pacman&scope=daily&day=2026-02-30", "game=pacman&scope=daily&day=2027-01-01", "game=pacman&day=2026-10-24", "game=pacman&game=chrome-siege", "scope=all",
  ])("rejects invalid query %s", async (query) => { expect((await request(`/api/leaderboards?${query}`)).status).toBe(400); });
  it("rejects cross-origin reads and writes with no permissive CORS", async () => {
    for (const path of ["/api/leaderboards?game=pacman", "/api/health"]) {
      const response = await request(path, undefined, { Origin: "https://hostile.example" });
      expect(response.status).toBe(403);
      expect(response.headers.has("access-control-allow-origin")).toBe(false);
    }
    expect((await request("/api/runs", { game: "pacman", ruleset: RULESET_VERSION }, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await request("/api/leaderboards?game=pacman", undefined, { Origin: ORIGIN })).status).toBe(200);
  });
  it("bounds JSON payloads including a chunked body with no content-length", async () => {
    const tooLarge = new Request(`${ORIGIN}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(MAX_BODY_BYTES) }) });
    expect((await handleRequest(tooLarge, env)).status).toBe(413);
    const malformed = new Request(`${ORIGIN}/api/runs`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect((await handleRequest(malformed, env)).status).toBe(400);
    for (const body of [null, [], 123]) expect((await request("/api/runs", body)).status).toBe(400);
    const wrongType = new Request(`${ORIGIN}/api/runs`, { method: "POST", body: "{}" });
    expect((await handleRequest(wrongType, env)).status).toBe(415);
  });
  it("handles methods, unknown endpoints and the Worker asset binding", async () => {
    expect((await request("/api/runs")).status).toBe(405);
    expect((await request("/api/no-such-endpoint")).status).toBe(404);
    expect((await request("/api/leaderboards?game=pacman", {})).status).toBe(405);
    env.ASSETS = { fetch: async () => new Response("actual assets") };
    expect(await (await request("/index.html")).text()).toBe("actual assets");
  });
});
