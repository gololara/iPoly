CREATE TABLE `memory_heads` (
	`note_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`version` integer NOT NULL,
	`guard` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memory_head_guard" CHECK("memory_heads"."guard"=1),
	CONSTRAINT "memory_head_version" CHECK("memory_heads"."version">=0)
);
--> statement-breakpoint
CREATE TABLE `memory_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`note_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`expected_note_version` integer NOT NULL,
	`expected_memory_version` integer NOT NULL,
	`content` text NOT NULL,
	`request_hash` text NOT NULL,
	`content_hash` text NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text,
	`cancelled_at` text,
	`approved_by` text,
	`guard` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memory_proposal_guard" CHECK("memory_proposals"."guard"=1),
	CONSTRAINT "memory_proposal_version" CHECK("memory_proposals"."version"=1 AND "memory_proposals"."expected_note_version">0 AND "memory_proposals"."expected_memory_version">=0),
	CONSTRAINT "memory_proposal_lifecycle" CHECK(("memory_proposals"."state"='proposed' AND "memory_proposals"."applied_at" IS NULL AND "memory_proposals"."cancelled_at" IS NULL AND "memory_proposals"."approved_by" IS NULL) OR ("memory_proposals"."state"='applied' AND "memory_proposals"."applied_at" IS NOT NULL AND "memory_proposals"."cancelled_at" IS NULL AND "memory_proposals"."approved_by" IS NOT NULL) OR ("memory_proposals"."state"='cancelled' AND "memory_proposals"."applied_at" IS NULL AND "memory_proposals"."cancelled_at" IS NOT NULL AND "memory_proposals"."approved_by" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `memory_proposals_owner_note_state` ON `memory_proposals` (`owner`,`note_id`,`state`);