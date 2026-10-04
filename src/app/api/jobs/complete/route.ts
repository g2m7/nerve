import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { getDb } from "@/lib/db/index";
import { PROMPT_VERSION } from "@/lib/context";
import { createProposalRecord } from "@/lib/proposals";
import { validateProposalJson } from "@/lib/validate";

export async function POST(req: Request) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const {
      cacheKey,
      adapter,
      jobType,
      proposal,
      reportedTokens,
      tokenEstimate,
      error,
      digest,
    } = body;

    const db = await getDb();
    const runId = crypto.randomUUID();

    if (error) {
      await db.query(
        `INSERT INTO agent_runs (id, adapter, job_type, cache_key, prompt_version, status, started_at, finished_at, est_tokens, reported_tokens, error)
         VALUES ($1, $2, $3, $4, $5, 'error', NOW(), NOW(), $6, $7, $8)`,
        [runId, adapter || "unknown", jobType || "unknown", cacheKey || "", PROMPT_VERSION, tokenEstimate || 0, reportedTokens || 0, error]
      );
      return errorResponse(`Run failed: ${error}`, 400);
    }

    const validated = validateProposalJson(proposal);

    // Save to job_cache
    if (cacheKey) {
      await db.query(
        `INSERT INTO job_cache (cache_key, result_json, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (cache_key) DO UPDATE SET result_json = EXCLUDED.result_json`,
        [cacheKey, JSON.stringify(validated)]
      );
    }

    // Record agent run
    await db.query(
      `INSERT INTO agent_runs (id, adapter, job_type, cache_key, prompt_version, status, started_at, finished_at, est_tokens, reported_tokens, error, context_digest)
       VALUES ($1, $2, $3, $4, $5, 'ok', NOW(), NOW(), $6, $7, '', $8)`,
      [runId, adapter, jobType, cacheKey || "", PROMPT_VERSION, tokenEstimate || 0, reportedTokens || null, digest || null]
    );

    // Create proposal record
    const proposalId = await createProposalRecord({
      job_type: jobType,
      rationale: validated.rationale,
      changes: validated.changes,
      evidence: validated.evidence,
      affected: validated.affected,
      adapter,
      cacheHit: false,
      tokenEstimate: tokenEstimate || 0,
    });

    return jsonResponse({
      ok: true,
      proposalId,
      status: "pending",
      runId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
