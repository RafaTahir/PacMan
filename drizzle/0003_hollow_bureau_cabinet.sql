PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cabinet_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`game` text NOT NULL,
	`ruleset` text NOT NULL,
	`seed` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`claim_token` text,
	`claim_expires_at` integer,
	`status` text DEFAULT 'issued' NOT NULL,
	CONSTRAINT "cabinet_runs_status_check" CHECK("__new_cabinet_runs"."status" in ('issued','verifying','accepted','rejected')),
	CONSTRAINT "cabinet_runs_game_check" CHECK("__new_cabinet_runs"."game" in ('orbit-salvage','tidal-courier','prism-circuit','skybound-stack','canopy-sprint','hollow-bureau')),
	CONSTRAINT "cabinet_runs_seed_check" CHECK("__new_cabinet_runs"."seed" between 1 and 4294967295)
);
--> statement-breakpoint
INSERT INTO `__new_cabinet_runs`("id", "game", "ruleset", "seed", "issued_at", "expires_at", "claim_token", "claim_expires_at", "status") SELECT "id", "game", "ruleset", "seed", "issued_at", "expires_at", "claim_token", "claim_expires_at", "status" FROM `cabinet_runs`;--> statement-breakpoint
DROP TABLE `cabinet_runs`;--> statement-breakpoint
ALTER TABLE `__new_cabinet_runs` RENAME TO `cabinet_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cabinet_runs_expiry_idx` ON `cabinet_runs` (`expires_at`);--> statement-breakpoint
CREATE INDEX `cabinet_runs_pending_expiry_idx` ON `cabinet_runs` (`expires_at`) WHERE "cabinet_runs"."status" != 'accepted';