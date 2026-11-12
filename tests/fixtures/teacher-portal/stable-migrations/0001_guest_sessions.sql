-- Append to the isolated teacher test schema, retaining copies and revocation tombstones.
ALTER TABLE attempts ADD COLUMN n INTEGER NOT NULL DEFAULT 0;
CREATE TABLE sessions(id TEXT PRIMARY KEY,copy_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
