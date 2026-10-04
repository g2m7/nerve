import { createHash } from "node:crypto";
import { getDb, type DbClient } from "./db/index";
import { dbGet } from "./db/repos";
import type { JobType } from "./types";

export const PROMPT_VERSION = "v2";
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
    "You review the week: vision, outcomes, bets due for review, overdue tasks, recent signals, and relevant vault notes. Return JSON only matching the output schema. Keep changes small and reversible.",
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
    vaultDocuments: Array<{
      id: string;
      name: string;
      path: string;
      type: string;
      content: string;
    }>;
  };
  digest: string;
  prompt: string;
}

function pick<T>(v: T | null): T | null {
  if (!v) return null;
  return v;
}

export async function compileContext(
  jobType: JobType,
  refs: JobRefs,
  db?: DbClient
): Promise<CompiledContext> {
  const client = db || (await getDb());
  const vision = await dbGet.vision(client);
  const outcome = refs.outcomeId ? pick(await dbGet.outcome(refs.outcomeId, client)) : null;
  const bet = refs.betId ? pick(await dbGet.bet(refs.betId, client)) : null;
  const signal = refs.signalId ? pick(await dbGet.signal(refs.signalId, client)) : null;

  const outcomeId =
    refs.outcomeId ??
    (bet as { outcome_id?: string } | null)?.outcome_id ??
    (signal as { outcome_id?: string } | null)?.outcome_id;
  const betId = refs.betId ?? (signal as { bet_id?: string } | null)?.bet_id;

  const allTasks = (await dbGet.tasks(client)).filter((t) => t.status === "open" || t.status === "doing");
  const activeTasks = allTasks
    .filter((t) => (outcomeId ? t.outcome_id === outcomeId : true) && (betId ? t.bet_id === betId || t.outcome_id === outcomeId : true))
    .slice(0, 10)
    .map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      deadline: t.deadline,
      blocked: t.blocked,
      revision: t.revision,
    }));

  const allSignals = await dbGet.signals(client);
  const recentSignals = allSignals
    .filter((s) => (outcomeId ? s.outcome_id === outcomeId : true) && (betId ? s.bet_id === betId : true))
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      title: s.title,
      kind: s.kind,
      evidence: s.evidence.slice(0, 500),
      occurred_at: s.occurred_at,
    }));

  const lastDecisionsRes = await client.query(
    `SELECT d.id, d.proposal_id, d.action, d.note, d.created_at
     FROM decisions d JOIN proposals p ON p.id = d.proposal_id
     WHERE p.job_type = $1 ORDER BY d.created_at DESC LIMIT 3`,
    [jobType]
  );
  const lastDecisions = lastDecisionsRes.rows;

  // Retrieve relevant Context Vault documents attached to these entities
  const vaultLinksRes = await client.query(
    `SELECT l.relation_type, n.id, n.name, n.path, n.type, n.raw_content
     FROM file_entity_links l
     JOIN file_nodes n ON l.file_node_id = n.id
     WHERE (
       (l.entity_type = 'vision' AND 1 = 1) OR
       (l.entity_type = 'outcome' AND l.entity_id = $1) OR
       (l.entity_type = 'bet' AND l.entity_id = $2) OR
       (l.entity_type = 'signal' AND l.entity_id = $3)
     ) AND (l.include_in_context = TRUE OR l.relation_type IN ('context', 'specification'))
     LIMIT 5`,
    [outcomeId || "", betId || "", refs.signalId || ""]
  );

  const vaultDocuments = vaultLinksRes.rows.map((doc: any) => ({
    id: doc.id,
    name: doc.name,
    path: doc.path,
    type: doc.type,
    content: (doc.raw_content || "").slice(0, 2000),
  }));

  const data = {
    vision: { text: vision.text.slice(0, 2000), revision: vision.revision },
    outcome: outcome
      ? { id: outcome.id, title: outcome.title, status: outcome.status, confidence: outcome.confidence, revision: outcome.revision }
      : null,
    bet: bet
      ? {
          id: bet.id,
          title: bet.title,
          assumption: bet.assumption.slice(0, 1000),
          rationale: bet.rationale.slice(0, 1000),
          confidence: bet.confidence,
          status: bet.status,
          review_date: bet.review_date,
          revision: bet.revision,
        }
      : null,
    signal: signal
      ? { id: signal.id, title: signal.title, kind: signal.kind, evidence: signal.evidence.slice(0, 1000), occurred_at: signal.occurred_at }
      : null,
    activeTasks,
    recentSignals,
    lastDecisions,
    vaultDocuments,
  };

  const digest = createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 32);
  const prompt = `${STATIC_PREFIX[jobType]}\n\nCONTEXT_JSON:\n${JSON.stringify(data)}`;

  return {
    jobType,
    promptVersion: PROMPT_VERSION,
    schemaVersion: OUTPUT_SCHEMA_VERSION,
    refs,
    data,
    digest,
    prompt,
  };
}

export function staticPrefix(jobType: JobType): string {
  return STATIC_PREFIX[jobType];
}

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
