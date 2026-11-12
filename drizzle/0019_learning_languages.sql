CREATE TABLE `learning_languages` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learning_languages_owner_id` ON `learning_languages` (`owner`,`id`);
