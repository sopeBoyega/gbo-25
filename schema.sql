PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS entries (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  photo BLOB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entries_status_seq ON entries(status, seq DESC);
CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
PRAGMA user_version = 1;
