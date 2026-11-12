CREATE TABLE class_sessions (
 class_id TEXT PRIMARY KEY, owner TEXT NOT NULL, version INTEGER NOT NULL,
 data TEXT NOT NULL, guard INTEGER NOT NULL DEFAULT 1 CHECK(guard=1)
);
--> statement-breakpoint
CREATE TABLE class_session_events (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, class_id TEXT NOT NULL,
 version INTEGER NOT NULL, request_hash TEXT NOT NULL, data TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(class_id,version)
);
--> statement-breakpoint
CREATE TABLE class_session_integrations (
 entry_id TEXT PRIMARY KEY, owner TEXT NOT NULL, class_id TEXT NOT NULL,
 note_id TEXT NOT NULL, closing_id TEXT NOT NULL
);
