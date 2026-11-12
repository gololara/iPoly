CREATE TABLE `class_teacher_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`class_id` text NOT NULL,
	`version` integer NOT NULL,
	`teacher_id` text,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`guard` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "class_teacher_guard_check" CHECK("class_teacher_events"."guard"=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_teacher_event_version` ON `class_teacher_events` (`class_id`,`version`);--> statement-breakpoint
CREATE TABLE `class_teachers` (
	`class_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`teacher_id` text,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action
);
