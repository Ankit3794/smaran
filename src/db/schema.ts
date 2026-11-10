// Database schema. Migration 1 is the whole v1 data model (spec section 9).
// Consumed by migrate.ts; SHARE_INBOX_DDL is also copied verbatim by the native share module.

// A single statement, because the Kotlin share activity runs it before the app has ever opened the database.
export const SHARE_INBOX_DDL = `CREATE TABLE IF NOT EXISTS share_inbox (
  id INTEGER PRIMARY KEY,
  shared_text TEXT NOT NULL,
  source_app TEXT,
  note TEXT,
  received_at INTEGER NOT NULL,
  undone INTEGER NOT NULL DEFAULT 0,
  ingested INTEGER NOT NULL DEFAULT 0
)`;

export const MIGRATION_1 = `
CREATE TABLE topics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Remembers merged topic names so the AI's old suggestions still land in the right topic.
CREATE TABLE topic_aliases (
  alias TEXT PRIMARY KEY COLLATE NOCASE,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE
);

CREATE TABLE saves (
  id INTEGER PRIMARY KEY,
  url TEXT,
  canonical_url TEXT UNIQUE,
  source TEXT NOT NULL,
  source_app TEXT,
  shared_text TEXT,
  title TEXT,
  author TEXT,
  extracted_text TEXT,
  image_url TEXT,
  thumb_path TEXT,
  summary TEXT,
  brief TEXT,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'fetching',
  status_reason TEXT,
  status_detail TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  lease_until INTEGER,
  inbox_id INTEGER UNIQUE,
  created_at INTEGER NOT NULL,
  last_saved_at INTEGER NOT NULL,
  opened_at INTEGER,
  extra_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX saves_by_last_saved ON saves(last_saved_at);
CREATE INDEX saves_by_topic ON saves(topic_id, last_saved_at);
CREATE INDEX saves_by_status_retry ON saves(status, next_retry_at);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE save_tags (
  save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (save_id, tag_id)
);

${SHARE_INBOX_DDL};

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Plain (not external-content) FTS table: rowid equals saves.id, and the tags column
-- is not a column of saves, so triggers rebuild each save's row from scratch.
CREATE VIRTUAL TABLE saves_fts USING fts5(summary, brief, title, author, note, extracted_text, tags);

CREATE TRIGGER saves_fts_insert AFTER INSERT ON saves BEGIN
  DELETE FROM saves_fts WHERE rowid = new.id;
  INSERT INTO saves_fts (rowid, summary, brief, title, author, note, extracted_text, tags)
  SELECT s.id, s.summary, s.brief, s.title, s.author, s.note, s.extracted_text,
    (SELECT group_concat(t.name, ' ') FROM save_tags st JOIN tags t ON t.id = st.tag_id WHERE st.save_id = s.id)
  FROM saves s WHERE s.id = new.id;
END;

CREATE TRIGGER saves_fts_update AFTER UPDATE ON saves BEGIN
  DELETE FROM saves_fts WHERE rowid = new.id;
  INSERT INTO saves_fts (rowid, summary, brief, title, author, note, extracted_text, tags)
  SELECT s.id, s.summary, s.brief, s.title, s.author, s.note, s.extracted_text,
    (SELECT group_concat(t.name, ' ') FROM save_tags st JOIN tags t ON t.id = st.tag_id WHERE st.save_id = s.id)
  FROM saves s WHERE s.id = new.id;
END;

CREATE TRIGGER saves_fts_delete AFTER DELETE ON saves BEGIN
  DELETE FROM saves_fts WHERE rowid = old.id;
END;

CREATE TRIGGER save_tags_fts_insert AFTER INSERT ON save_tags BEGIN
  DELETE FROM saves_fts WHERE rowid = new.save_id;
  INSERT INTO saves_fts (rowid, summary, brief, title, author, note, extracted_text, tags)
  SELECT s.id, s.summary, s.brief, s.title, s.author, s.note, s.extracted_text,
    (SELECT group_concat(t.name, ' ') FROM save_tags st JOIN tags t ON t.id = st.tag_id WHERE st.save_id = s.id)
  FROM saves s WHERE s.id = new.save_id;
END;

CREATE TRIGGER save_tags_fts_delete AFTER DELETE ON save_tags BEGIN
  DELETE FROM saves_fts WHERE rowid = old.save_id;
  INSERT INTO saves_fts (rowid, summary, brief, title, author, note, extracted_text, tags)
  SELECT s.id, s.summary, s.brief, s.title, s.author, s.note, s.extracted_text,
    (SELECT group_concat(t.name, ' ') FROM save_tags st JOIN tags t ON t.id = st.tag_id WHERE st.save_id = s.id)
  FROM saves s WHERE s.id = old.save_id;
END;
`;
