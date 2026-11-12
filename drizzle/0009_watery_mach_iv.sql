CREATE TABLE `publication_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publication_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`publication_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teacher_publications` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`class_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`code_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`published_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`guard` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "publication_guard" CHECK("teacher_publications"."guard"=1)
);
--> statement-breakpoint
CREATE INDEX `publication_owner_teacher` ON `teacher_publications` (`owner`,`teacher_id`);