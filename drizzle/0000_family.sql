CREATE TABLE trip_documents (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE quest_checks (id TEXT PRIMARY KEY NOT NULL, done INTEGER NOT NULL DEFAULT 0, updated_by TEXT NOT NULL, updated_at TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE media (id TEXT PRIMARY KEY NOT NULL, object_key TEXT, kind TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0, filename TEXT NOT NULL, title TEXT NOT NULL, caption TEXT NOT NULL DEFAULT '', day INTEGER NOT NULL, author_id TEXT NOT NULL, author_name TEXT NOT NULL, url TEXT, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX media_created_at_idx ON media (created_at);
