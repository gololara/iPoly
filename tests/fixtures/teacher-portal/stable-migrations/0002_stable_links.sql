-- Additive: legacy copies, sessions, commands and revocation tombstones remain untouched.
CREATE TABLE teacher_access (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL, enabled INTEGER NOT NULL,
 teacher_name TEXT, shared_by_name TEXT, current_copy_id TEXT, updated_at INTEGER NOT NULL
);
CREATE TABLE portal_copies (
 id TEXT PRIMARY KEY, link_id TEXT NOT NULL, payload TEXT NOT NULL,
 published_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
