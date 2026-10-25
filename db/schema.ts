import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** Values are application secrets/settings, never player profiles. */
export const serviceSettings = sqliteTable("service_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  game: text("game").notNull(),
  ruleset: text("ruleset").notNull(),
  seed: integer("seed").notNull(),
  issuedAt: integer("issued_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  claimToken: text("claim_token"),
  claimExpiresAt: integer("claim_expires_at"),
  status: text("status", { enum: ["issued", "verifying", "accepted", "rejected"] }).notNull().default("issued"),
}, (table) => [
  index("runs_expiry_idx").on(table.expiresAt),
  index("runs_pending_expiry_idx").on(table.expiresAt).where(sql`${table.status} != 'accepted'`),
  check("runs_status_check", sql`${table.status} in ('issued','verifying','accepted','rejected')`),
  check("runs_game_check", sql`${table.game} in ('pacman','neon-rally','reactor-breaker','chrome-siege','midnight-pinball')`),
  check("runs_seed_check", sql`${table.seed} between 1 and 4294967295`),
]);

/** Accepted scores have no expiry. Initials are public, nonunique guest labels. */
export const scores = sqliteTable("scores", {
  runId: text("run_id").primaryKey().references(() => runs.id),
  game: text("game").notNull(),
  ruleset: text("ruleset").notNull(),
  initials: text("initials").notNull(),
  score: integer("score").notNull(),
  frames: integer("frames").notNull(),
  finishedAt: integer("finished_at").notNull(),
  finishedDay: text("finished_day").notNull(),
  replayHash: text("replay_hash").notNull(),
}, (table) => [
  index("scores_all_time_idx").on(table.game, sql`${table.score} desc`, table.finishedAt, table.runId),
  index("scores_daily_idx").on(table.game, table.finishedDay, sql`${table.score} desc`, table.finishedAt, table.runId),
  check("scores_nonnegative_check", sql`${table.score} >= 0`),
  check("scores_frames_check", sql`${table.frames} between 1 and 7272`),
  check("scores_initials_check", sql`length(${table.initials}) = 3 and ${table.initials} not glob '*[^A-Z]*'`),
]);

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)]);
