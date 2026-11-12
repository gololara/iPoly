CREATE TABLE `material_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`publication_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL,
	`state` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `teacher_publications` ADD `delivery_status` text DEFAULT 'pending' NOT NULL;