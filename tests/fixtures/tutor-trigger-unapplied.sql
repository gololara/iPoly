CREATE TABLE tutor_records (
 id text PRIMARY KEY NOT NULL,
 owner text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('preparation','closing')),
 parent_id text REFERENCES tutor_records(id),
 state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','applied')),
 version integer NOT NULL DEFAULT 1,
 data text NOT NULL,
 request_hash text NOT NULL,
 created_at text NOT NULL,
 applied_at text,
 CHECK((kind='preparation' AND parent_id IS NULL) OR (kind='closing' AND parent_id IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX tutor_owner_created ON tutor_records(owner,created_at);
--> statement-breakpoint
CREATE INDEX tutor_parent_owner ON tutor_records(parent_id,owner);
--> statement-breakpoint
-- Executed inside the same D1 batch transaction as revisions. Guards races,
-- including two closings with no note changes. Snapshots never mutate.
CREATE TRIGGER tutor_apply_guard BEFORE UPDATE OF state ON tutor_records
WHEN OLD.state='proposed' AND NEW.state='applied'
BEGIN
 SELECT CASE WHEN OLD.kind='preparation' AND EXISTS(
  SELECT 1 FROM json_each(OLD.data,'$.references') r
  WHERE NOT EXISTS(SELECT 1 FROM notes n WHERE n.owner=OLD.owner AND n.id=json_extract(r.value,'$.noteId') AND n.version=json_extract(r.value,'$.expectedVersion'))
 ) THEN RAISE(ABORT,'TUTOR_CONFLICT') END;
 SELECT CASE WHEN OLD.kind='closing' AND NOT EXISTS(
  SELECT 1 FROM tutor_records p WHERE p.id=OLD.parent_id AND p.owner=OLD.owner AND p.kind='preparation' AND p.state='applied' AND p.version=json_extract(OLD.data,'$.expectedPreparationVersion')
 ) THEN RAISE(ABORT,'TUTOR_CONFLICT') END;
 SELECT CASE WHEN OLD.kind='closing' AND EXISTS(
  SELECT 1 FROM json_each(OLD.data,'$.changes') c
  WHERE NOT EXISTS(SELECT 1 FROM notes n WHERE n.owner=OLD.owner AND n.id=json_extract(c.value,'$.noteId') AND n.version=json_extract(c.value,'$.expectedVersion'))
 ) THEN RAISE(ABORT,'TUTOR_CONFLICT') END;
END;
