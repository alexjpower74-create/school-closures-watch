-- School Closures Watch D1 schema (API.md §7). Local only.

-- One row per used source that has ever been ingested.
CREATE TABLE source_health (
  id TEXT PRIMARY KEY,
  last_attempt_at TEXT,
  last_ok_at TEXT,
  last_result TEXT NOT NULL DEFAULT 'never',   -- ok | error | format_changed | never
  last_error TEXT,
  http_status INTEGER,
  list_date TEXT,
  list_date_text TEXT,
  open_rule_quote TEXT,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  quotes_dropped INTEGER NOT NULL DEFAULT 0,
  unmapped_classes TEXT NOT NULL DEFAULT '[]'
);

-- Raw copies: the last 3 ingests per source, plus any raw a current notice still points at.
CREATE TABLE raw_copies (
  raw_ref TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  url TEXT,
  fetched_at TEXT,
  format TEXT,
  body TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX raw_by_source ON raw_copies (source_id, ingested_at);

-- The whole Notice lives in json; the other columns are copies for queries.
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  sample INTEGER NOT NULL DEFAULT 0,
  list_date TEXT,
  status TEXT NOT NULL,
  rank INTEGER NOT NULL,
  scope TEXT NOT NULL,
  scope_region TEXT,
  json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  removed_at TEXT
);
CREATE INDEX notices_current ON notices (removed_at, sample);
CREATE INDEX notices_by_source ON notices (source_id, sample, removed_at);

CREATE TABLE scans (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  summary TEXT NOT NULL
);
CREATE INDEX scans_by_start ON scans (started_at);
