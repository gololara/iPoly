CREATE TABLE tutor_records (
 id text PRIMARY KEY NOT NULL,
 owner text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('preparation','closing')),
 parent_id text REFERENCES tutor_records(id),
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','applied')),
 version integer NOT NULL DEFAULT 1,
 apply_guard integer NOT NULL DEFAULT 1,
 data text NOT NULL,
 request_hash text NOT NULL,
 created_at text NOT NULL,
 applied_at text,
 CONSTRAINT tutor_apply_guard_check CHECK(apply_guard=1),
 CHECK((kind='preparation' AND parent_id IS NULL) OR (kind='closing' AND parent_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX tutor_owner_created ON tutor_records(owner,created_at);
--> statement-breakpoint
CREATE INDEX tutor_parent_owner ON tutor_records(parent_id,owner);
