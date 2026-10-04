import { ensureMigrated, errorResponse, jsonResponse } from "@/lib/api-helper";
import { getDb } from "@/lib/db/index";
import { buildCacheKey, compileContext, estimateTokens, PROMPT_VERSION, OUTPUT_SCHEMA_VERSION } from "@/lib/context";
import { createProposalRecord } from "@/lib/proposals";
import type { AdapterId, JobType } from "@/lib/types";

export async function POST(req: Request) {
  try {
    await ensureMigrated();
    const body = await req.json();
    const { adapter, jobType, refs, model } = body as {
      adapter: AdapterId;
      jobType: JobType;
      refs: { outcomeId?: string; betId?: string; signalId?: string };
      model?: string;
    };

    if (!adapter || !jobType) {
      return errorResponse("adapter and jobType are required", 400);
    }

    const compiled = await compileContext(jobType, refs || {});
    const chosenModel = model || "default";

    const cacheKey = buildCacheKey({
      adapter,
      model: chosenModel,
      jobType,
      promptVersion: PROMPT_VERSION,
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      digest: compiled.digest,
    });

    const db = await getDb();
    const cacheRow = await db.query("SELECT result_json FROM job_cache WHERE cache_key = $1", [cacheKey]);

    if (cacheRow.rows.length > 0) {
      const cached = cacheRow.rows[0].result_json;
      const proposalData = typeof cached === "string" ? JSON.parse(cached) : cached;

      const runId = crypto.randomUUID();
      const tokenEst = estimateTokens(compiled.prompt, JSON.stringify(proposalData));

      // Record cache-hit run
      await db.query(
        `INSERT INTO agent_runs (id, adapter, job_type, cache_key, prompt_version, status, started_at, finished_at, est_tokens, reported_tokens, error)
         VALUES ($1, $2, $3, $4, $5, 'cache_hit', NOW(), NOW(), $6, 0, '')`,
        [runId, adapter, jobType, cacheKey, PROMPT_VERSION, tokenEst]
      );

      const proposalId = await createProposalRecord({
        job_type: jobType,
        rationale: proposalData.rationale,
        changes: proposalData.changes,
        evidence: proposalData.evidence || [],
        affected: proposalData.affected || [],
        adapter,
        cacheHit: true,
        tokenEstimate: tokenEst,
      });

      return jsonResponse({
        cacheHit: true,
        cacheKey,
        proposalId,
        tokenEstimate: tokenEst,
      });
    }

    // Cache Miss: send compiled context packet to client for execution
    const tokenEst = estimateTokens(compiled.prompt, "{}");
    return jsonResponse({
      cacheHit: false,
      cacheKey,
      prompt: compiled.prompt,
      digest: compiled.digest,
      schemaVersion: OUTPUT_SCHEMA_VERSION,
      tokenEstimate: tokenEst,
      jobType,
      adapter,
      model: chosenModel,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
