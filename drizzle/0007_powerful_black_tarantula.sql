CREATE TABLE `class_detail_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`class_id` text NOT NULL,
	`class_date` text,
	`class_type` text,
	`methodology` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`request_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`guard` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "class_detail_guard_check" CHECK("class_detail_events"."guard"=1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_detail_event_version` ON `class_detail_events` (`class_id`,`version`);--> statement-breakpoint
CREATE TABLE `class_details` (
	`class_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`class_date` text,
	`class_type` text,
	`methodology` text DEFAULT '' NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL
);
