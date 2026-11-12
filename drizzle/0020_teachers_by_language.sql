ALTER TABLE `teachers` ADD `language_id` text;--> statement-breakpoint
CREATE INDEX `teachers_owner_language_created` ON `teachers` (`owner`,`language_id`,`created_at`);