/** Local-only native workerd/D1 regression; no persistent or remote DB binding. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions, NoOpLog } from "miniflare";
import { withForeignKeyIntegrityGuard } from "./d1-migration-integrity.mjs";

const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: 'export default {fetch(){return new Response("isolated migration regression")}}',
  compatibilityDate: "2026-10-01", d1Databases: ["DB"], cf: false, log: new NoOpLog(),
}));
const split = sql => sql.split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean);
try {
  const db = await mf.getD1Database("DB");
  for (const file of ["0000_initial_leaderboards.sql", "0001_recoverable_claims_and_pending_expiry.sql", "0002_additional_cabinets.sql"])
    for (const sql of split(await readFile(`drizzle/${file}`, "utf8"))) await db.prepare(sql).run();
  // These are isolated test fixtures; they are never installed in a live board.
  for (const [runs, scores, game] of [["runs", "scores", "pacman"], ["cabinet_runs", "cabinet_scores", "orbit-salvage"]]) {
    await db.prepare(`INSERT INTO ${runs}(id,game,ruleset,seed,issued_at,expires_at,status) VALUES(?,?,?,?,?,?,?)`).bind(`fixture-${game}`, game, "after-hours-v2", 1, 1, 2, "accepted").run();
    await db.prepare(`INSERT INTO ${scores}(run_id,game,ruleset,initials,score,frames,finished_at,finished_day,replay_hash) VALUES(?,?,?,?,?,?,?,?,?)`).bind(`fixture-${game}`, game, "after-hours-v2", "QAQ", 100, 1, 1, "2026-11-01", "fixture-hash").run();
  }
  const rows = async () => {
    const snapshot = {};
    for (const table of ["runs", "scores", "cabinet_runs", "cabinet_scores"])
      snapshot[table] = (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results;
    return snapshot;
  };
  const before = await rows();
  const beforeSchema = (await db.prepare("SELECT sql FROM sqlite_master WHERE name = 'cabinet_runs'").first()).sql;
  assert.equal(beforeSchema.includes("hollow-bureau"), false, "old schema does not yet accept the new cabinet");
  const sql = await readFile("drizzle/0003_hollow_bureau_cabinet.sql", "utf8");
  const migration = split(sql);
  await assert.rejects(db.batch(migration.map(statement => db.prepare(statement))), "original transactional migration reproduces the deferred FK failure");
  assert.deepEqual(await rows(), before, "failed original migration rolls back all accepted rows");
  assert.equal((await db.prepare("SELECT sql FROM sqlite_master WHERE name = 'cabinet_runs'").first()).sql, beforeSchema);

  const guarded = withForeignKeyIntegrityGuard(migration);
  const guardIndex = guarded.findIndex(statement => statement.startsWith("CREATE TABLE __arcade_migration_fk_guard"));
  const corrupt = [...guarded];
  corrupt.splice(guardIndex, 0, "INSERT INTO cabinet_scores(run_id,game,ruleset,initials,score,frames,finished_at,finished_day,replay_hash) VALUES('missing-run','orbit-salvage','after-hours-v2','QAQ',1,1,1,'2026-11-01','fixture-only')");
  await assert.rejects(db.batch(corrupt.map(statement => db.prepare(statement))), "integrity guard rejects a real FK violation before clearing deferral");
  assert.deepEqual(await rows(), before, "failed integrity guard rolls back migration and fixtures");
  assert.equal((await db.prepare("SELECT sql FROM sqlite_master WHERE name = 'cabinet_runs'").first()).sql, beforeSchema, "failed guard preserves the old schema and game-ID constraint");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = '__arcade_migration_fk_guard'").first()).n, 0);

  await db.batch(guarded.map(statement => db.prepare(statement)));
  assert.deepEqual(await rows(), before, "safe transaction preserves every original/cabinet accepted run and score field");
  assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
  await db.prepare("INSERT INTO cabinet_runs(id,game,ruleset,seed,issued_at,expires_at,status) VALUES('new-hollow','hollow-bureau','after-hours-v2',1,1,2,'issued')").run();
  await assert.rejects(db.prepare("INSERT INTO cabinet_scores(run_id,game,ruleset,initials,score,frames,finished_at,finished_day,replay_hash) VALUES('still-missing','orbit-salvage','after-hours-v2','QAQ',1,1,1,'2026-11-01','fixture-only')").run(), "FK enforcement remains enabled after migration");
  console.log(JSON.stringify({ nativeD1: "passed", originalFailureReproduced: true, originalFailureRollback: "passed", corruptMigrationGuardAndRollback: "passed", acceptedRowsPreserved: true, foreignKeysEnforced: true, newCabinetInsert: "passed", productionChanges: false }));
} finally { await mf.dispose(); }
