/** Offline release gate: disposable native D1 only; never connects to production. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Miniflare, convertV4MiniflareOptions, NoOpLog } from "miniflare";

const baseline = JSON.parse(await readFile("scripts/migration-baseline.json", "utf8"));
const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
for (const [file, hash] of Object.entries(baseline.files))
  assert.equal(createHash("sha256").update(await readFile(file)).digest("hex"), hash, `Published migration history changed: ${file}`);
assert.deepEqual(journal.entries.slice(0, baseline.journalEntries.length), baseline.journalEntries, "Published migration journal entries are immutable");
assert.equal(new Set(journal.entries.map(e => e.tag)).size, journal.entries.length, "Duplicate migration tag");
const sqlFiles = (await readdir("drizzle")).filter(f => f.endsWith(".sql")).sort();
assert.deepEqual(sqlFiles, journal.entries.map(e => `${e.tag}.sql`).sort(), "Every SQL migration must have exactly one journal entry");
const migrations = await Promise.all(journal.entries.map(async (entry, index) => {
  assert.equal(entry.idx, index, "Migration journal indices must remain sequential");
  if (index) assert.ok(entry.when > journal.entries[index - 1].when, "Migration timestamps must increase");
  return (await readFile(`drizzle/${entry.tag}.sql`, "utf8")).split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
}));
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: 'export default {fetch(){return new Response("isolated release verification")}}',
  compatibilityDate: "2026-10-01", d1Databases: ["DB"], cf: false, log: new NoOpLog(),
}));
try {
  const db = await mf.getD1Database("DB");
  const apply = statements => db.batch(statements.map(s => db.prepare(s)));
  // The fresh Site's current baseline must install with the unmodified SQL.
  for (const statements of migrations.slice(0, baseline.journalEntries.length)) await apply(statements);
  for (const [runs, scores, game] of [["runs", "scores", "pacman"], ["cabinet_runs", "cabinet_scores", "hollow-bureau"]]) {
    await db.prepare(`INSERT INTO ${runs}(id,game,ruleset,seed,issued_at,expires_at,status) VALUES(?,?,?,?,?,?,?)`).bind(`release-fixture-${game}`, game, "after-hours-v2", 1, 1, 2, "accepted").run();
    await db.prepare(`INSERT INTO ${scores}(run_id,game,ruleset,initials,score,frames,finished_at,finished_day,replay_hash) VALUES(?,?,?,?,?,?,?,?,?)`).bind(`release-fixture-${game}`, game, "after-hours-v2", "QAQ", 100, 1, 1, "2026-11-02", "isolated-fixture").run();
  }
  const tables = ["runs", "scores", "cabinet_runs", "cabinet_scores"];
  const before = Object.fromEntries(await Promise.all(tables.map(async table => [table, (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results])));
  // Crucially, future appended migrations run with real-shaped score history,
  // never just on empty tables. Any unsupported rebuild fails this release gate.
  for (const statements of migrations.slice(baseline.journalEntries.length)) await apply(statements);
  for (const table of tables) {
    const rows = (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results;
    assert.equal(rows.length, before[table].length, `${table}: preserved row count`);
    for (let i = 0; i < rows.length; i++)
      for (const [key, value] of Object.entries(before[table][i])) assert.deepEqual(rows[i][key], value, `${table}.${key}: preserved original value`);
  }
  assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
  for (const [scores, game] of [["scores", "pacman"], ["cabinet_scores", "hollow-bureau"]])
    await assert.rejects(db.prepare(`INSERT INTO ${scores}(run_id,game,ruleset,initials,score,frames,finished_at,finished_day,replay_hash) VALUES('missing-parent',?,'after-hours-v2','QAQ',1,1,1,'2026-11-02','isolated-fixture')`).bind(game).run(), "Orphan scores remain rejected");
} finally { await mf.dispose(); }
// Keep the known populated-0003 failure, rollback, and guarded recovery regression.
const regression = spawnSync(process.execPath, ["scripts/verify-d1-migration.mjs"], { stdio: "inherit" });
assert.equal(regression.status, 0, "Populated upgrade/rollback regression must pass");
console.log(JSON.stringify({ migrationReleaseGate: "passed", immutableBaseline: true, freshDatabase: true, populatedFutureUpgrade: true, productionChanges: false, productionApproval: false }));
