import { getDb, type DbClient } from "./index";

export const PG_MIGRATIONS = [
  // 1. Core Vision Tables
  `CREATE TABLE IF NOT EXISTS visions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    text TEXT NOT NULL DEFAULT '',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS vision_history (
    id TEXT PRIMARY KEY,
    vision_id INTEGER NOT NULL REFERENCES visions(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 2. Strategic Direction & Execution
  `CREATE TABLE IF NOT EXISTS outcomes (
    id TEXT PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'archived')),
    confidence VARCHAR(32) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
    target_date DATE,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL,
    title VARCHAR(300) NOT NULL,
    assumption TEXT NOT NULL DEFAULT '',
    rationale TEXT NOT NULL DEFAULT '',
    confidence VARCHAR(32) NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'supported', 'refuted', 'archived')),
    review_date DATE,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'doing', 'done', 'dropped')),
    priority VARCHAR(16) NOT NULL DEFAULT 'p2' CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
    deadline DATE,
    outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL,
    bet_id TEXT REFERENCES bets(id) ON DELETE SET NULL,
    blocked SMALLINT NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS signals (
    id TEXT PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    kind VARCHAR(32) NOT NULL DEFAULT 'note' CHECK (kind IN ('note', 'metric', 'quote', 'event')),
    evidence TEXT NOT NULL DEFAULT '',
    outcome_id TEXT REFERENCES outcomes(id) ON DELETE SET NULL,
    bet_id TEXT REFERENCES bets(id) ON DELETE SET NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 3. File & Directory Management (Context Vault)
  `CREATE TABLE IF NOT EXISTS file_nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES file_nodes(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL DEFAULT 'file' CHECK (type IN ('directory', 'file', 'note', 'snippet')),
    path TEXT NOT NULL,
    mime_type VARCHAR(128) NOT NULL DEFAULT 'text/plain',
    size_bytes BIGINT NOT NULL DEFAULT 0,
    storage_backend VARCHAR(32) NOT NULL DEFAULT 'local_fs',
    storage_key TEXT,
    content_hash VARCHAR(64),
    raw_content TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS file_entity_links (
    id TEXT PRIMARY KEY,
    file_node_id TEXT NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
    entity_type VARCHAR(32) NOT NULL,
    entity_id TEXT NOT NULL,
    relation_type VARCHAR(32) NOT NULL DEFAULT 'reference',
    include_in_context BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_file_entity UNIQUE (file_node_id, entity_type, entity_id)
  );`,

  // 4. Proposals & Decisions
  `CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    job_type VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    rationale TEXT NOT NULL DEFAULT '',
    changes JSONB NOT NULL DEFAULT '[]'::jsonb,
    evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
    affected JSONB NOT NULL DEFAULT '[]'::jsonb,
    adapter VARCHAR(64),
    cache_hit BOOLEAN NOT NULL DEFAULT FALSE,
    token_estimate INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
  );`,

  `CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    proposal_id TEXT REFERENCES proposals(id) ON DELETE SET NULL,
    action VARCHAR(32) NOT NULL CHECK (action IN ('accepted', 'rejected')),
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 5. Agent Runs & Job Cache
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    adapter VARCHAR(64) NOT NULL,
    job_type VARCHAR(64) NOT NULL,
    cache_key VARCHAR(64) NOT NULL,
    prompt_version VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'running' CHECK (status IN ('ok', 'cache_hit', 'error', 'unavailable', 'running')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    est_tokens INTEGER NOT NULL DEFAULT 0,
    reported_tokens INTEGER,
    error TEXT NOT NULL DEFAULT '',
    context_digest VARCHAR(64),
    output_raw TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS job_cache (
    cache_key VARCHAR(64) PRIMARY KEY,
    result_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 6. MCP Integration
  `CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    transport VARCHAR(32) NOT NULL DEFAULT 'stdio' CHECK (transport IN ('stdio', 'sse', 'streamable_http')),
    is_local BOOLEAN NOT NULL DEFAULT TRUE,
    command TEXT,
    args JSONB NOT NULL DEFAULT '[]'::jsonb,
    env JSONB NOT NULL DEFAULT '{}'::jsonb,
    url TEXT,
    headers JSONB NOT NULL DEFAULT '{}'::jsonb,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    cached_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
    last_discovered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS mcp_tool_calls (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    agent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,
    tool_name VARCHAR(128) NOT NULL,
    input_arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
    output_result JSONB,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'error', 'timeout')),
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 7. Local Bridge Sessions & System Settings
  `CREATE TABLE IF NOT EXISTS local_bridge_sessions (
    id TEXT PRIMARY KEY,
    client_machine_name VARCHAR(128) NOT NULL,
    auth_token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
    ip_address VARCHAR(64),
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    installed_adapters JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  `CREATE TABLE IF NOT EXISTS system_settings (
    key VARCHAR(128) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // 8. Audit Logs
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    entity_name VARCHAR(64) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,
    actor VARCHAR(64) NOT NULL DEFAULT 'founder',
    previous_state JSONB,
    new_state JSONB,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`,

  // Indexes
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);`,
  `CREATE INDEX IF NOT EXISTS idx_signals_created ON signals(created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_runs_created ON agent_runs(started_at);`,
  `CREATE INDEX IF NOT EXISTS idx_file_nodes_path ON file_nodes(path);`,
  `CREATE INDEX IF NOT EXISTS idx_file_nodes_parent ON file_nodes(parent_id);`,
  `CREATE INDEX IF NOT EXISTS idx_file_links_entity ON file_entity_links(entity_type, entity_id);`,
  `CREATE INDEX IF NOT EXISTS idx_mcp_tool_calls_server ON mcp_tool_calls(server_id);`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);`,
];

export async function migratePg(db?: DbClient): Promise<void> {
  const client = db || (await getDb());
  for (const sql of PG_MIGRATIONS) {
    try {
      await client.query(sql);
    } catch (err: any) {
      console.warn("Migration statement warning:", err.message, "SQL:", sql.slice(0, 50));
    }
  }

  // Ensure vision row id=1 exists
  const res = await client.query("SELECT COUNT(*) AS n FROM visions WHERE id = 1");
  const count = Number(res.rows[0]?.n || 0);
  if (count === 0) {
    await client.query(
      "INSERT INTO visions(id, text, revision, updated_at) VALUES (1, '', 1, NOW())"
    );
  }
}
