# Migration release safety

The new Site starts with a separate, empty database. The former Site and its
scores remain untouched. This solves this launch's populated-0003 problem; it
does not make arbitrary future database changes safe.

## Required release gate

After `npm ci`, run `node scripts/verify-migration-release.mjs` before publishing.
CI runs this same command. It uses disposable native workerd/D1 databases only:

- Checks frozen SHA-256 hashes for SQL and snapshots through 0003, plus the
  immutable prefix of the migration journal. Append migrations; never edit,
  remove, reorder, or replay already published ones. Do not regenerate the
  baseline to silence a failure.
- Installs the unchanged baseline on a fresh database, then inserts clearly
  isolated accepted run/score fixtures in both leaderboard table families.
- Applies every newly appended migration against those populated tables and
  checks row counts, every original field, foreign-key integrity and orphan
  rejection. Add fixtures for any new tables, pending claims, constraints and
  transformations introduced by each future migration.
- Re-runs the existing populated-0003 regression, including failure rollback,
  deliberately corrupted migration rejection, and guarded recovery.

The baseline is a regression reference, NOT a production migration journal.
Do not infer live migration status from it. A passing gate does not prove
performance at production scale, every data shape, or the publisher's behavior.

## Production procedure

1. Keep the same Site identity, database binding and audience for normal updates.
   Prefer schema-free application releases. Build/test from the exact source
   being published, including this gate. Record commit, saved version and result.
2. For database changes, inspect the actual live journal/schema through a
   supported platform mechanism. Establish which migrations are pending and
   preserve a supported recovery point. Never guess status after a failed publish.
3. Review generated SQL before publishing. Avoid drops, parent-table rebuilds,
   foreign-key toggles and data deletion as routine release steps. Use additive
   schema changes and an expand/contract plan when necessary. Future cabinets
   should use a reviewed extensible game catalog or new additive table design
   instead of repeatedly rebuilding a score-referenced table to edit a CHECK
   list. That redesign must itself be tested and safely migrated; it is not
   silently included in this game-code-preserving release.
4. If the publisher cannot safely execute a required operation, stop that
   migration, not the database. In particular follow `MIGRATION_0003_RELEASE.md`
   for an existing pre-0003 database: guarded single D1 transaction and actual
   journal update together. No request-time schema changes, fake applied markers,
   split rebuilds, or database replacement as an implicit workaround.
5. After publishing, verify deployment, all changed routes, leaderboard reads
   and legitimate score submission. Preserve score counts/fields for an upgrade;
   clearly label isolated fixtures and never seed fake live competitors.

CI plus this release procedure catches the known regression before deployment;
it is not a guarantee that no future migration or platform failure can occur.
