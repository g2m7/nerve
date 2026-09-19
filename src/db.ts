import { Database } from "bun:sqlite";

export const MIGRATIONS: string[] = [
  `PRAGMA foreign_keys = ON;`,
  `CREATE TABLE IF NOT EXISTS vision(
    id INTEGER PRIMARY KEY CHECK(id = 1),
    text TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS vision_history(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS outcomes(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','done','archived')),
    confidence TEXT NOT NULL DEFAULT 'medium' CHECK(confidence IN ('low','medium','high')),
    target_date TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS bets(
    id TEXT PRIMARY KEY,
    outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    assumption TEXT NOT NULL DEFAULT '',
    rationale TEXT NOT NULL DEFAULT '',
    confidence TEXT NOT NULL DEFAULT 'medium' CHECK(confidence IN ('low','medium','high')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','supported','refuted','archived')),
    review_date TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tasks(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','doing','done','dropped')),
    priority TEXT NOT NULL DEFAULT 'p2' CHECK(priority IN ('p0','p1','p2','p3')),
    deadline TEXT,
    outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL,
    bet_id TEXT REFERENCES bets(id) ON DELETE SET NULL,
    blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)),
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS signals(
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'note' CHECK(kind IN ('note','metric','quote','event')),
    evidence TEXT NOT NULL DEFAULT '',
    outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL,
    bet_id TEXT REFERENCES bets(id) ON DELETE SET NULL,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS proposals(
    id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
    rationale TEXT NOT NULL DEFAULT '',
    changes_json TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    affected_json TEXT NOT NULL DEFAULT '[]',
    adapter TEXT,
    cache_hit INTEGER NOT NULL DEFAULT 0,
    token_estimate INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    decided_at TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS decisions(
    id TEXT PRIMARY KEY,
    proposal_id TEXT REFERENCES proposals(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK(action IN ('accepted','rejected')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS agent_runs(
    id TEXT PRIMARY KEY,
    adapter TEXT NOT NULL,
    job_type TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ok','cache-hit','error','unavailable')),
    started_at TEXT NOT NULL,
    finished_at TEXT,
    est_tokens INTEGER NOT NULL DEFAULT 0,
    reported_tokens INTEGER,
    error TEXT NOT NULL DEFAULT ''
  );`,
  `CREATE TABLE IF NOT EXISTS job_cache(
    cache_key TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
   CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
   CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);
   CREATE INDEX IF NOT EXISTS idx_runs_created ON agent_runs(started_at);`,
];

export function openDb(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

export function migrate(db: Database): void {
  for (const sql of MIGRATIONS) db.exec(sql);
  const row = db.query("SELECT COUNT(*) AS n FROM vision WHERE id = 1").get() as {
    n: number;
  };
  if (row.n === 0) {
    db.query("INSERT INTO vision(id, text, revision, updated_at) VALUES (1, '', 1, ?)").run(
      new Date().toISOString(),
    );
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return crypto.randomUUID();
}
