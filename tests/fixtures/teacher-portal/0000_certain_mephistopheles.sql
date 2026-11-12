CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`failures` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commands` (
	`request_id` text PRIMARY KEY NOT NULL,
	`hash` text NOT NULL,
	`action` text NOT NULL,
	`publication_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `copies` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`data` text,
	`code_hash` text,
	`published_at` integer,
	`expires_at` integer,
	`revoked_at` integer,
	`guard` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "copy_guard" CHECK("copies"."guard"=1)
);
