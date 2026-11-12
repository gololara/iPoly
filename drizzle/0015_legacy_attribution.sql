CREATE TABLE `memory_attribution_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`note_id` text NOT NULL,
	`debrief_id` text NOT NULL,
	`previous_id` text,
	`predecessor_key` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`request_hash` text NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	`created_at` text NOT NULL,
	`applied_at` text,
	`approved_by` text,
	`cancelled_at` text,
	`guard` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`debrief_id`) REFERENCES `debriefs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`previous_id`) REFERENCES `memory_attribution_corrections`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attribution_predecessor_key" CHECK("memory_attribution_corrections"."predecessor_key"=coalesce("memory_attribution_corrections"."previous_id",'')),
	CONSTRAINT "attribution_guard" CHECK("memory_attribution_corrections"."guard"=1),
	CONSTRAINT "attribution_state" CHECK("memory_attribution_corrections"."state" IN ('proposed','applied','cancelled')),
	CONSTRAINT "attribution_approval" CHECK(("memory_attribution_corrections"."state"='applied' AND "memory_attribution_corrections"."approved_by" IS NOT NULL AND "memory_attribution_corrections"."approved_by"="memory_attribution_corrections"."owner" AND "memory_attribution_corrections"."applied_at" IS NOT NULL AND "memory_attribution_corrections"."cancelled_at" IS NULL) OR ("memory_attribution_corrections"."state"='proposed' AND "memory_attribution_corrections"."approved_by" IS NULL AND "memory_attribution_corrections"."applied_at" IS NULL AND "memory_attribution_corrections"."cancelled_at" IS NULL) OR ("memory_attribution_corrections"."state"='cancelled' AND "memory_attribution_corrections"."approved_by" IS NULL AND "memory_attribution_corrections"."applied_at" IS NULL AND "memory_attribution_corrections"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX `attribution_owner_note` ON `memory_attribution_corrections` (`owner`,`note_id`,`debrief_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attribution_applied_predecessor` ON `memory_attribution_corrections` (`owner`,`note_id`,`debrief_id`,`predecessor_key`) WHERE "memory_attribution_corrections"."state"='applied';
