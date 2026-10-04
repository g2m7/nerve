// Unified domain types for Nerve OS on PostgreSQL

export type ID = string;

export interface Vision {
  id: number;
  text: string;
  revision: number;
  created_at: string;
  updated_at: string;
  history?: VisionHistoryItem[];
}

export interface VisionHistoryItem {
  id: ID;
  vision_id: number;
  text: string;
  revision: number;
  created_at: string;
}

export type OutcomeStatus = "active" | "done" | "archived";
export type ConfidenceLevel = "low" | "medium" | "high";

export interface Outcome {
  id: ID;
  title: string;
  description: string;
  status: OutcomeStatus;
  confidence: ConfidenceLevel;
  target_date: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export type BetStatus = "open" | "supported" | "refuted" | "archived";

export interface Bet {
  id: ID;
  outcome_id: ID | null;
  title: string;
  assumption: string;
  rationale: string;
  confidence: ConfidenceLevel;
  status: BetStatus;
  review_date: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = "open" | "doing" | "done" | "dropped";
export type TaskPriority = "p0" | "p1" | "p2" | "p3";

export interface Task {
  id: ID;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string | null; // YYYY-MM-DD
  outcome_id: ID | null;
  bet_id: ID | null;
  blocked: number; // 0 | 1
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface NowView {
  overdue: Task[];
  dueNext: Task[];
  unblockedQueue: Task[];
  blocked: Task[];
  ordered: Task[];
}

export type SignalKind = "note" | "metric" | "quote" | "event";

export interface Signal {
  id: ID;
  title: string;
  kind: SignalKind;
  evidence: string;
  outcome_id: ID | null;
  bet_id: ID | null;
  occurred_at: string;
  created_at: string;
  updated_at: string;
}

// ---------------- File & Context Vault Types ----------------
export type FileNodeType = "directory" | "file" | "note" | "snippet";
export type StorageBackend = "local_fs" | "s3_blob" | "embedded_db";

export interface FileNode {
  id: ID;
  parent_id: ID | null;
  name: string;
  type: FileNodeType;
  path: string;
  mime_type: string;
  size_bytes: number;
  storage_backend: StorageBackend;
  storage_key: string | null;
  content_hash: string | null;
  raw_content: string | null;
  metadata: Record<string, unknown>;
  revision: number;
  created_at: string;
  updated_at: string;
  children?: FileNode[];
}

export type LinkRelationType =
  | "evidence"
  | "specification"
  | "context"
  | "deliverable"
  | "transcript"
  | "reference";

export interface FileEntityLink {
  id: ID;
  file_node_id: ID;
  entity_type: "vision" | "outcome" | "bet" | "task" | "signal" | "agent_run" | "decision";
  entity_id: ID;
  relation_type: LinkRelationType;
  include_in_context: boolean;
  notes: string;
  created_at: string;
  file_node?: FileNode;
}

// ---------------- Proposals & Decisions ----------------
export type ProposalStatus = "pending" | "accepted" | "rejected";

export interface ProposalChange {
  op: "create" | "update";
  entity: "vision" | "outcome" | "bet" | "task";
  id?: ID;
  expectedRevision?: number;
  fields: Record<string, unknown>;
}

export interface Proposal {
  id: ID;
  job_type: JobType;
  status: ProposalStatus;
  rationale: string;
  changes: ProposalChange[];
  changes_json?: string;
  evidence: string[];
  evidence_json?: string;
  affected: string[];
  affected_json?: string;
  adapter: string | null;
  cache_hit: boolean;
  token_estimate: number;
  created_at: string;
  decided_at: string | null;
}

export interface Decision {
  id: ID;
  proposal_id: ID | null;
  action: "accepted" | "rejected";
  note: string;
  created_at: string;
}

// ---------------- Agent Runs & Adapters ----------------
export type AdapterId = "codex" | "agy" | "opencode" | "pi" | "droid";
export type JobType =
  | "clarify-vision"
  | "challenge-bet"
  | "assess-signal"
  | "replan-work"
  | "weekly-review";

export type AgentRunStatus = "ok" | "cache_hit" | "error" | "unavailable" | "running";

export interface AgentRun {
  id: ID;
  adapter: AdapterId;
  job_type: JobType;
  cache_key: string;
  prompt_version: string;
  status: AgentRunStatus;
  started_at: string;
  finished_at: string | null;
  est_tokens: number;
  reported_tokens: number | null;
  error: string;
  context_digest?: string | null;
  output_raw?: string | null;
}

// ---------------- MCP & Bridge Types ----------------
export type McpTransport = "stdio" | "sse" | "streamable_http";

export interface McpServer {
  id: ID;
  name: string;
  transport: McpTransport;
  is_local: boolean;
  command?: string | null;
  args?: string[];
  env?: Record<string, string>;
  url?: string | null;
  headers?: Record<string, string>;
  enabled: boolean;
  cached_tools: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
  last_discovered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface McpToolCall {
  id: ID;
  server_id: ID;
  agent_run_id?: ID | null;
  tool_name: string;
  input_arguments: Record<string, unknown>;
  output_result?: unknown;
  status: "pending" | "success" | "error" | "timeout";
  error?: string | null;
  duration_ms?: number | null;
  created_at: string;
}

export interface LocalBridgeSession {
  id: ID;
  client_machine_name: string;
  auth_token_hash: string;
  status: "active" | "inactive" | "revoked";
  ip_address: string | null;
  last_heartbeat_at: string;
  installed_adapters: AdapterId[];
  created_at: string;
}

export interface AuditLog {
  id: number;
  entity_name: string;
  entity_id: string;
  action: string;
  actor: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  timestamp: string;
}
