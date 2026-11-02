# Hollow Bureau practice compatibility

Hollow Bureau plays locally in practice mode. New ranked runs are temporarily rejected by the API; existing leaderboard reads remain available. Other cabinets retain ranked play.

This change does not make the Sites package safe to deploy by itself. The package still contains migration 0003 and its original journal entry. Sites applies pending hosted migrations during publication, and the live journal and schema have not been established. Do not publish until the publisher can verify migration status and either apply 0003 using the guarded transaction in `MIGRATION_0003_RELEASE.md` or confirm a supported way to defer it without altering migration history. Preserve all existing migrations and production records.
