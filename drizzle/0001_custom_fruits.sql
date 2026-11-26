CREATE TABLE custom_fruits (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, normalized_name TEXT NOT NULL, local_name TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', author_id TEXT NOT NULL, author_name TEXT NOT NULL, created_at TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX custom_fruits_normalized_name_idx ON custom_fruits (normalized_name);
