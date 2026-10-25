ALTER TABLE `runs` ADD `claim_token` text;--> statement-breakpoint
ALTER TABLE `runs` ADD `claim_expires_at` integer;--> statement-breakpoint
CREATE INDEX `runs_pending_expiry_idx` ON `runs` (`expires_at`) WHERE "runs"."status" != 'accepted';