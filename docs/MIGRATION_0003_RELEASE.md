# Pending migration 0003: preserve existing scores

Migration `0003_hollow_bureau_cabinet.sql` rebuilds `cabinet_runs` to admit the eleventh cabinet. With existing rows in `cabinet_scores`, native D1 reproduces a transactional commit failure even though the rebuilt data passes `PRAGMA foreign_key_check`. SQLite retains a deferred foreign-key counter from dropping the referenced table; re-creating the parent under its old name does not clear that counter. Turning `foreign_keys` off/on inside a D1 transaction does not solve this.

The existing migration file and its metadata are deliberately unchanged. Its live deployment status cannot be established from this executor, which has no Sites deployment/database tools. Do not rewrite or replay an already applied migration, and do not assume that a passing fresh empty-database test establishes upgrade safety.

## Publisher procedure

1. Use the existing Site's supported deployment/database tools to inspect its migration journal and schema. Preserve the current Site identity, audience and database. If 0003 is already applied, do not run it again.
2. If and only if 0003 is pending, use a supported **single transactional D1 batch** for the reviewed pending migration, followed by the integrity guard from `scripts/d1-migration-integrity.mjs`. Prepare one SQL statement per batch entry. The guard creates a uniquely named check table, inserts the count from `pragma_foreign_key_check` subject to `CHECK (violations = 0)`, removes the guard and clears `defer_foreign_keys` only after integrity is proven. A guard-name collision or actual foreign-key violation fails the transaction; no existing table is overwritten by the guard.
3. Include the publisher's normal migration-journal update in the same transaction after the guard, so a failure rolls back both schema and tracking. Use the actual supported platform journal mechanism; the helper neither invents its table name nor marks migrations applied itself. Verify preserved score/run counts and fields, empty `PRAGMA foreign_key_check`, FK enforcement and the newly allowed cabinet ID. Never mark 0003 applied on a failed transaction.
4. If the Sites publishing flow cannot express that guarded transaction, stop before applying 0003 and obtain a supported migration path. Do not split the table rebuild into independent requests, disable FK enforcement, reset data, or upload a replacement database to force deployment.

The helper only constructs statement strings for a trusted publisher. It does not connect to a live database, discover migration status, apply changes, upload a Worker or deploy a Site.

## Repeatable local verification

Run `node scripts/verify-d1-migration.mjs` after installing the locked dependencies. It creates an isolated in-memory native workerd/D1 database, uses explicitly labelled test fixtures in both original and cabinet score tables, and checks:

- Original 0003 fails with existing cabinet score history and rolls back without changing rows or schema.
- A deliberately orphaned score in the guarded batch causes the integrity CHECK to reject and roll back, preserving original rows/schema/game-ID restrictions.
- The valid guarded batch preserves every fixture field, leaves no FK violations, admits `hollow-bureau`, and continues rejecting orphan scores afterwards.

The verification does not access production, use a persistent DB binding, install fake live competitors, or demonstrate migration performance on an arbitrarily large database. Expected rejected SQL may emit native workerd diagnostics; the final JSON summary and process exit status report the regression result.
