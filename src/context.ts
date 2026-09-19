import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import { dbGet } from "./repos.ts";
import type { JobType } from "./types.ts";

// Static prompt templates first, dynamic data last. Versioned. No timestamps
// or request IDs in the static prefix.

export const PROMPT_VERSION = "v1";
export const OUTPUT_SCHEMA_VERSION = "v1";

const STATIC_PREFIX: Record<JobType, string> = {
  "clarify-vision":
    "You help a solo founder sharpen their vision statement. Return JSON only matching the output schema. Prefer small precise edits. Do not invent metrics.",
  "challenge-bet":
    "You stress-test a strategic bet and its assumption. Return JSON only matching the output schema. Name the strongest counter-evidence and what would change your mind.",
  "assess-signal":
    "You assess one observed signal against the linked bet/outcome. Return JSON only matching the output schema. Judge whether the bet is supported, refuted, or unchanged.",
  "replan-work":
    "You propose a minimal task-list repair: deadlines, priorities, blocked flags. Return JSON only matching the output schema. Do not rewrite strategy; only tasks.",
  "weekly-review":
    "You review the week: vision, outcomes, bets due for review, overdue tasks, recent signals. Return JSON only matching the output schema. Keep changes small and reversible.",
};

export interface JobRefs {
  outcomeId?: string;
  betId?: string;
  signalId?: string;
}

export interface CompiledContext {
  jobType: JobType;
  promptVersion: string;
  schemaVersion: string;
  refs: JobRefs;
  data: {
    vision: { text: string; revision: number };
    outcome: unknown;
    bet: unknown;
    signal: unknown;
    activeTasks: unknown[];
    recentSignals: unknown[];
    lastDecisions: unknown[];
  };
  digest: string; // content digest of data
  prompt: string; // static prefix + rendered dynamic JSON
}

function pick<T>(v: T | null): T | null {
  if (!v) return null;
  return v;
}

export function compileContext(db: Database, jobType: JobType, refs: JobRefs): CompiledContext {
  const vision = dbGet.vision(db);
  const outcome = refs.outcomeId ? pick(dbGet.outcome(db, refs.outcomeId)) : null;
  const bet = refs.betId ? pick(dbGet.bet(db, refs.betId)) : null;
  const signal = refs.signalId ? pick(dbGet.signal(db, refs.signalId)) : null;

  const outcomeId = refs.outcomeId ?? (bet as { outcome_id?: string } | null)?.outcome_id ?? (signal as { outcome_id?: string } | null)?.outcome_id;
  const betId = refs.betId ?? (signal as { bet_id?: string } | null)?.bet_id;

  const allTasks = dbGet.tasks(db).filter((t) => t.status === "open" || t.status === "doing");
  const activeTasks = allTasks
    .filter((t) => (outcomeId ? t.outcome_id === outcomeId : true) && (betId ? t.bet_id === betId || t.outcome_id === outcomeId : true))
    .slice(0, 10)
    .map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, deadline: t.deadline, blocked: t.blocked, revision: t.revision }));

  const allSignals = dbGet.signals(db);
  const recentSignals = allSignals
    .filter((s) => (outcomeId ? s.outcome_id === outcomeId : true) && (betId ? s.bet_id === betId : true))
    .slice(0, 5)
    .map((s) => ({ id: s.id, title: s.title, kind: s.kind, evidence: s.evidence.slice(0, 500), occurred_at: s.occurred_at }));

  const lastDecisions = (db.query(
    `SELECT d.id, d.proposal_id, d.action, d.note, d.created_at
       FROM decisions d JOIN proposals p ON p.id = d.proposal_id
      WHERE p.job_type = ? ORDER BY d.created_at DESC LIMIT 3`).all(jobType) ?? []) as unknown[];

  const data = {
    vision: { text: vision.text.slice(0, 2000), revision: vision.revision },
    outcome: outcome ? { id: outcome.id, title: outcome.title, status: outcome.status, confidence: outcome.confidence, revision: outcome.revision } : null,
    bet: bet
      ? { id: bet.id, title: bet.title, assumption: bet.assumption.slice(0, 1000), rationale: bet.rationale.slice(0, 1000), confidence: bet.confidence, status: bet.status, review_date: bet.review_date, revision: bet.revision }
      : null,
    signal: signal ? { id: signal.id, title: signal.title, kind: signal.kind, evidence: signal.evidence.slice(0, 1000), occurred_at: signal.occurred_at } : null,
    activeTasks,
    recentSignals,
    lastDecisions,
  };
  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 32);
  const prompt = `${STATIC_PREFIX[jobType]}\n\nCONTEXT_JSON:\n${JSON.stringify(data)}`;
  return { jobType, promptVersion: PROMPT_VERSION, schemaVersion: OUTPUT_SCHEMA_VERSION, refs, data, digest, prompt };
}

export function staticPrefix(jobType: JobType): string {
  return STATIC_PREFIX[jobType];
}

// Rough token estimate: ~4 chars per token. Deterministic and cheap.
export function estimateTokens(prompt: string, outputJson: string): number {
  return Math.ceil((prompt.length + outputJson.length) / 4);
}

export function buildCacheKey(args: {
  adapter: string;
  model: string;
  jobType: JobType;
  promptVersion: string;
  schemaVersion: string;
  digest: string;
}): string {
  const raw = [args.adapter, args.model, args.jobType, args.promptVersion, args.schemaVersion, args.digest].join("|");
  return createHash("sha256").update(raw).digest("hex");
}
