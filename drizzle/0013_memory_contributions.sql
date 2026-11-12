CREATE TABLE `memory_contribution_attachments` (
	`contribution_id` text NOT NULL,
	`attachment_id` text NOT NULL,
	`speaker_role` text,
	`speaker_id` text,
	`speaker_name` text,
	`recorder_role` text,
	`recorded_by` text,
	`recorder_name` text,
	`consent_at` text,
	PRIMARY KEY(`contribution_id`, `attachment_id`),
	FOREIGN KEY (`contribution_id`) REFERENCES `memory_contributions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachments`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memory_attachment_speaker_role" CHECK("memory_contribution_attachments"."speaker_role" IS NULL OR "memory_contribution_attachments"."speaker_role" IN ('user','ai','tutor','unknown')),
	CONSTRAINT "memory_attachment_recorder_role" CHECK("memory_contribution_attachments"."recorder_role" IS NULL OR "memory_contribution_attachments"."recorder_role" IN ('user','ai','tutor','unknown'))
);
--> statement-breakpoint
CREATE TABLE `memory_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`note_id` text NOT NULL,
	`kind` text DEFAULT 'addition' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`author_role` text NOT NULL,
	`author_id` text,
	`author_name` text,
	`recorder_role` text,
	`recorded_by` text,
	`recorder_name` text,
	`class_id` text,
	`state` text DEFAULT 'proposed' NOT NULL,
	`approved_by` text,
	`created_at` text NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memory_contribution_role" CHECK("memory_contributions"."author_role" IN ('user','ai','tutor','unknown')),
	CONSTRAINT "memory_contribution_kind" CHECK("memory_contributions"."kind" IN ('addition','debrief','correction','exercise')),
	CONSTRAINT "memory_contribution_approval" CHECK(("memory_contributions"."state"='proposed' AND "memory_contributions"."applied_at" IS NULL) OR ("memory_contributions"."state"='applied' AND "memory_contributions"."applied_at" IS NOT NULL AND "memory_contributions"."approved_by" IS NOT NULL)),
	CONSTRAINT "memory_contribution_recorder_role" CHECK("memory_contributions"."recorder_role" IS NULL OR "memory_contributions"."recorder_role" IN ('user','ai','tutor','unknown'))
);
--> statement-breakpoint
CREATE INDEX `memory_contributions_owner_note` ON `memory_contributions` (`owner`,`note_id`,`created_at`);
