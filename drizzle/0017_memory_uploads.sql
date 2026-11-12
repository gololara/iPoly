CREATE TABLE `memory_uploads` (
	`attachment_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`note_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `memory_uploads_owner_note` ON `memory_uploads` (`owner`,`note_id`);