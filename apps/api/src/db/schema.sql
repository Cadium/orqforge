PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  app_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  source_kind TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  image_tag TEXT,
  route_path TEXT,
  runtime_container_name TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deployment_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  stage TEXT NOT NULL,
  stream TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE,
  UNIQUE (deployment_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_deployment_logs_deployment_seq
  ON deployment_logs (deployment_id, seq);
