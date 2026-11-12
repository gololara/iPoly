CREATE TABLE `memory_classes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`language` text NOT NULL,
	`title` text NOT NULL,
	`teacher_id` text,
	`class_date` text,
	`created_at` text NOT NULL,
	`request_hash` text NOT NULL,
	`guard` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memory_class_guard" CHECK("memory_classes"."guard"=1)
);
--> statement-breakpoint
CREATE INDEX `memory_classes_owner_created` ON `memory_classes` (`owner`,`created_at`);