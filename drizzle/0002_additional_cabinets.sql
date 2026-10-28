CREATE TABLE `cabinet_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`ruleset` text NOT NULL,
	`seed` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claim_token` text,
	`claim_expires_at` integer,
	`status` text DEFAULT 'issued' NOT NULL,
	CONSTRAINT "cabinet_runs_status_check" CHECK("cabinet_runs"."status" in ('issued','verifying','accepted','rejected')),
	CONSTRAINT "cabinet_runs_game_check" CHECK("cabinet_runs"."game" in ('orbit-salvage','tidal-courier','prism-circuit','skybound-stack','canopy-sprint')),
	CONSTRAINT "cabinet_runs_seed_check" CHECK("cabinet_runs"."seed" between 1 and 4294967295)
);
--> statement-breakpoint
CREATE INDEX `cabinet_runs_expiry_idx` ON `cabinet_runs` (`expires_at`);--> statement-breakpoint
CREATE INDEX `cabinet_runs_pending_expiry_idx` ON `cabinet_runs` (`expires_at`) WHERE "cabinet_runs"."status" != 'accepted';--> statement-breakpoint
CREATE TABLE `cabinet_scores` (
	`run_id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`ruleset` text NOT NULL,
	`initials` text NOT NULL,
	`score` integer NOT NULL,
	`frames` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`finished_day` text NOT NULL,
	`replay_hash` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `cabinet_runs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cabinet_scores_nonnegative_check" CHECK("cabinet_scores"."score" >= 0),
	CONSTRAINT "cabinet_scores_frames_check" CHECK("cabinet_scores"."frames" between 1 and 7272),
	CONSTRAINT "cabinet_scores_initials_check" CHECK(length("cabinet_scores"."initials") = 3 and "cabinet_scores"."initials" not glob '*[^A-Z]*')
);
--> statement-breakpoint
CREATE INDEX `cabinet_scores_all_time_idx` ON `cabinet_scores` (`game`,"score" desc,`finished_at`,`run_id`);--> statement-breakpoint
CREATE INDEX `cabinet_scores_daily_idx` ON `cabinet_scores` (`game`,`finished_day`,"score" desc,`finished_at`,`run_id`);