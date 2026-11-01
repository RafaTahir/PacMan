/** Build a single D1.batch transaction that clears SQLite's deferred FK counter
 * only after a SQL CHECK proves there are no actual foreign-key violations.
 * Input must come from a reviewed, pending schema migration, never a request.
 * The publisher must include its normal migration-journal update in that same
 * transaction. This helper does not discover status or connect to production. */
export function withForeignKeyIntegrityGuard(statements) {
  if (!Array.isArray(statements) || !statements.length || statements.some(sql => typeof sql !== "string" || !sql.trim()))
    throw new TypeError("A nonempty list of reviewed migration statements is required.");
  if (statements.some(sql => /^\s*(?:BEGIN|COMMIT|ROLLBACK|END\s+TRANSACTION)\b/i.test(sql)))
    throw new Error("D1.batch owns the transaction; explicit transaction control is not allowed.");
  return [
    ...statements,
    "CREATE TABLE __arcade_migration_fk_guard (violations INTEGER NOT NULL CHECK (violations = 0))",
    "INSERT INTO __arcade_migration_fk_guard SELECT COUNT(*) FROM pragma_foreign_key_check",
    "DROP TABLE __arcade_migration_fk_guard",
    "PRAGMA defer_foreign_keys = OFF",
  ];
}
