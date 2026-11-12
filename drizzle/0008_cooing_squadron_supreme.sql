CREATE TABLE `material_selections` (
	`class_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`data` text NOT NULL,
	`version` integer NOT NULL,
	`request_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`guard` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "material_selection_guard_check" CHECK("material_selections"."guard"=1)
);
