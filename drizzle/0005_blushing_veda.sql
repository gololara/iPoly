CREATE TABLE `teacher_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`teacher_id` text NOT NULL,
	`version` integer NOT NULL,
	`request_hash` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teacher_edits_teacher_version` ON `teacher_edits` (`teacher_id`,`version`);--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`languages` text DEFAULT '[]' NOT NULL,
	`delivery_preference` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `teachers_owner_created` ON `teachers` (`owner`,`created_at`);