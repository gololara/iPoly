CREATE TABLE `tutor_thread_events` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `tutor_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tutor_thread_events_thread_owner` ON `tutor_thread_events` (`thread_id`,`owner`);--> statement-breakpoint
CREATE TABLE `tutor_thread_members` (
	`preparation_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`preparation_id`) REFERENCES `tutor_records`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `tutor_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tutor_thread_members_thread_owner` ON `tutor_thread_members` (`thread_id`,`owner`);--> statement-breakpoint
CREATE TABLE `tutor_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`language` text NOT NULL,
	`current_preparation_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`guard` integer DEFAULT 1 NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`current_preparation_id`) REFERENCES `tutor_records`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "tutor_thread_guard_check" CHECK("tutor_threads"."guard"=1)
);
--> statement-breakpoint
CREATE INDEX `tutor_threads_owner` ON `tutor_threads` (`owner`);