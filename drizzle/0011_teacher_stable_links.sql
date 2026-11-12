CREATE TABLE teacher_links (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, teacher_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('active','disable_pending','disabled')),
 version INTEGER NOT NULL, remote_version INTEGER NOT NULL DEFAULT 0,
 current_publication_id TEXT, pending_publication_id TEXT,
 created_at INTEGER NOT NULL, disabled_at INTEGER
);
--> statement-breakpoint
CREATE UNIQUE INDEX teacher_one_live_link ON teacher_links(owner,teacher_id) WHERE status<>'disabled';
--> statement-breakpoint
CREATE INDEX teacher_links_owner_teacher ON teacher_links(owner,teacher_id,created_at);
--> statement-breakpoint
CREATE TABLE teacher_share_copies (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, link_id TEXT NOT NULL,
 class_id TEXT NOT NULL, teacher_id TEXT NOT NULL, link_version INTEGER NOT NULL,
 snapshot TEXT NOT NULL, request_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', published_at INTEGER, expires_at INTEGER,
 guard INTEGER NOT NULL DEFAULT 1 CHECK(guard=1)
);
--> statement-breakpoint
CREATE TABLE teacher_share_outbox (
 id TEXT PRIMARY KEY, owner TEXT NOT NULL, link_id TEXT NOT NULL,
 version INTEGER NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', guard INTEGER NOT NULL DEFAULT 1 CHECK(guard=1)
);
