// Shared domain types. DB is the sole authority; these mirror row shapes.

export type ID = string;

export interface Vision {
  text: string;
  revision: number;
  updated_at: string;
}

export interface Outcome {
  id: ID;
  title: string;
  description: string;
  status: "active" | "done" | "archived";
  confidence: "low" | "medium" | "high";
  target_date: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface Bet {
  id: ID;
  outcome_id: string | null;
  title: string;
  assumption: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  status: "open" | "supported" | "refuted" | "archived";
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
  outcome_id: string | null;
  bet_id: string | null;
  blocked: number; // 0 | 1
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: ID;
  title: string;
  kind: "note" | "metric" | "quote" | "event";
  evidence: string;
  outcome_id: string | null;
  bet_id: string | null;
  occurred_at: string;
  created_at: string;
}

export type ProposalStatus = "pending" | "accepted" | "rejected";
export interface ProposalChange {
  entity: "vision" | "outcome" | "bet" | "task";
  op: "create" | "update";
  id?: string;
  expectedRevision?: number;
  value: Record<string, unknown>;
}
export interface Proposal {
  id: ID;
  job_type: string;
  status: ProposalStatus;
  rationale: string;
  changes_json: string;
  evidence_json: string;
  affected_json: string;
  adapter: string | null;
  cache_hit: number;
  token_estimate: number;
  created_at: string;
  decided_at: string | null;
}

export interface Decision {
  id: ID;
  proposal_id: string | null;
  action: "accepted" | "rejected";
  note: string;
  created_at: string;
}

export interface AgentRun {
  id: ID;
  adapter: string;
  job_type: string;
  cache_key: string;
  prompt_version: string;
  status: "ok" | "cache-hit" | "error" | "unavailable";
  started_at: string;
  finished_at: string | null;
  est_tokens: number;
  reported_tokens: number | null;
  error: string;
}

export type JobType =
  | "clarify-vision"
  | "challenge-bet"
  | "assess-signal"
  | "replan-work"
  | "weekly-review";

export const JOB_TYPES: JobType[] = [
  "clarify-vision",
  "challenge-bet",
  "assess-signal",
  "replan-work",
  "weekly-review",
];

export const ADAPTER_IDS = ["codex", "agy", "opencode", "pi", "droid"] as const;
export type AdapterId = (typeof ADAPTER_IDS)[number];
