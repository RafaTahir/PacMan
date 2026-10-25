CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expiry_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`ruleset` text NOT NULL,
	`seed` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	CONSTRAINT "runs_status_check" CHECK("runs"."status" in ('issued','verifying','accepted','rejected')),
	CONSTRAINT "runs_game_check" CHECK("runs"."game" in ('pacman','neon-rally','reactor-breaker','chrome-siege','midnight-pinball')),
	CONSTRAINT "runs_seed_check" CHECK("runs"."seed" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE INDEX `runs_expiry_idx` ON `runs` (`expires_at`);--> statement-breakpoint
CREATE TABLE `scores` (
	`run_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`ruleset` text NOT NULL,
	`initials` text NOT NULL,
	`score` integer NOT NULL,
	`frames` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`finished_day` text NOT NULL,
	`replay_hash` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "scores_nonnegative_check" CHECK("scores"."score" >= 0),
	CONSTRAINT "scores_frames_check" CHECK("scores"."frames" between 1 and 7272),
	CONSTRAINT "scores_initials_check" CHECK(length("scores"."initials") = 3 and "scores"."initials" not glob '*[^A-Z]*')
);
--> statement-breakpoint
CREATE INDEX `scores_all_time_idx` ON `scores` (`game`,"score" desc,`finished_at`,`run_id`);--> statement-breakpoint
CREATE INDEX `scores_daily_idx` ON `scores` (`game`,`finished_day`,"score" desc,`finished_at`,`run_id`);--> statement-breakpoint
CREATE TABLE `service_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
