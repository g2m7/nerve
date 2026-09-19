import type { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { newId, nowIso } from "../db.ts";
import { buildCacheKey, compileContext, estimateTokens } from "../context.ts";
import { createProposal } from "../proposals.ts";
import { validateProposalJson } from "../validate.ts";
import type { AdapterId, JobType } from "../types.ts";
import { buildAdapters, childEnv, jobPromptFile, makeJobDir, outputSchemaFile, spawnAdapter } from "./adapters.ts";

export interface RunJobArgs {
  adapter: AdapterId;
  jobType: JobType;
  refs: { outcomeId?: string; betId?: string; signalId?: string };
  model?: string;
}

export interface RunJobResult {
  proposalId: string | null;
  runId: string;
  cacheHit: boolean;
  tokenEstimate: number;
  error?: string;
}

let detectCache: { at: number; value: Record<AdapterId, boolean> } | null = null;

export function resetDetectCache(): void {
  detectCache = null;
}

export async function detectAdapters(timeoutMs = 4000): Promise<Record<AdapterId, boolean>> {
  if (detectCache && Date.now() - detectCache.at < 30_000) return { ...detectCache.value };
  const ids: AdapterId[] = ["codex", "agy", "opencode", "pi", "droid"];
  const envPrefix: Record<AdapterId, string> = {
    codex: "CODEX", agy: "AGY", opencode: "OPENCODE", pi: "PI", droid: "DROID",
  };
  const out = {} as Record<AdapterId, boolean>;
  await Promise.all(
    ids.map(async (id) => {
      try {
        const bin = process.env[`NERVE_${envPrefix[id]}_BIN`] || id;
        const proc = Bun.spawn([bin, "--version"], { stdout: "ignore", stderr: "ignore", env: childEnv() });
        const exit = await Promise.race([
          proc.exited,
          new Promise<number>((res) => setTimeout(() => res(999), timeoutMs)),
        ]);
        out[id] = exit === 0;
        try { proc.kill(); } catch { /* noop */ }
      } catch {
        out[id] = false;
      }
    }),
  );
  detectCache = { at: Date.now(), value: { ...out } };
  return out;
}

export function adapterEnv(): Record<string, string | undefined> {
  return {
    NERVE_CODEX_BIN: process.env["NERVE_CODEX_BIN"],
    NERVE_CODEX_MODEL: process.env["NERVE_CODEX_MODEL"],
    NERVE_CODEX_EXTRA_ARGS: process.env["NERVE_CODEX_EXTRA_ARGS"],
    NERVE_AGY_BIN: process.env["NERVE_AGY_BIN"],
    NERVE_AGY_MODEL: process.env["NERVE_AGY_MODEL"],
    NERVE_AGY_EXTRA_ARGS: process.env["NERVE_AGY_EXTRA_ARGS"],
    NERVE_OPENCODE_BIN: process.env["NERVE_OPENCODE_BIN"],
    NERVE_OPENCODE_MODEL: process.env["NERVE_OPENCODE_MODEL"],
    NERVE_OPENCODE_EXTRA_ARGS: process.env["NERVE_OPENCODE_EXTRA_ARGS"],
    NERVE_PI_BIN: process.env["NERVE_PI_BIN"],
    NERVE_PI_MODEL: process.env["NERVE_PI_MODEL"],
    NERVE_PI_EXTRA_ARGS: process.env["NERVE_PI_EXTRA_ARGS"],
    NERVE_DROID_BIN: process.env["NERVE_DROID_BIN"],
    NERVE_DROID_MODEL: process.env["NERVE_DROID_MODEL"],
    NERVE_DROID_EXTRA_ARGS: process.env["NERVE_DROID_EXTRA_ARGS"],
  };
}

export async function runJob(db: Database, args: RunJobArgs): Promise<RunJobResult> {
  const started = nowIso();
  const runId = newId();
  const detected = await detectAdapters();
  const specs = buildAdapters(adapterEnv(), detected);
  const spec = specs[args.adapter];
  const model = args.model ?? spec.configuredModel ?? "";
  const compiled = compileContext(db, args.jobType, args.refs);
  const cacheKey = buildCacheKey({
    adapter: args.adapter,
    model,
    jobType: args.jobType,
    promptVersion: compiled.promptVersion,
    schemaVersion: compiled.schemaVersion,
    digest: compiled.digest,
  });

  // Exact cache: same state/request reuses successful result.
  const cached = db.query("SELECT result_json FROM job_cache WHERE cache_key = ?").get(cacheKey) as {
    result_json: string;
  } | null;
  if (cached) {
    try {
      const parsed = validateProposalJson(JSON.parse(cached.result_json));
      const tokenEstimate = estimateTokens(compiled.prompt, cached.result_json);
      const proposalId = createProposal(db, {
        job_type: args.jobType,
        rationale: parsed.rationale,
        changes: parsed.changes,
        evidence: parsed.evidence,
        affected: parsed.affected,
        adapter: args.adapter,
        cacheHit: true,
        tokenEstimate,
      });
      db.query(
        "INSERT INTO agent_runs(id,adapter,job_type,cache_key,prompt_version,status,started_at,finished_at,est_tokens,reported_tokens,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(runId, args.adapter, args.jobType, cacheKey, compiled.promptVersion, "cache-hit", started, nowIso(), tokenEstimate, null, "");
      return { proposalId, runId, cacheHit: true, tokenEstimate };
    } catch {
      // Corrupt cache entry: fall through to fresh run.
    }
  }

  if (!spec.available) {
    db.query(
      "INSERT INTO agent_runs(id,adapter,job_type,cache_key,prompt_version,status,started_at,finished_at,est_tokens,reported_tokens,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(runId, args.adapter, args.jobType, cacheKey, compiled.promptVersion, "unavailable", started, nowIso(), 0, null, `${spec.bin} not found`);
    return { proposalId: null, runId, cacheHit: false, tokenEstimate: 0, error: `${spec.bin} CLI not installed` };
  }

  const jobDir = makeJobDir();
  try {
    const schemaFile = outputSchemaFile(jobDir);
    jobPromptFile(jobDir, compiled.prompt, args.jobType);
    const argv = spec.argv(compiled.prompt, { jobDir, schemaFile, model });
    const timeoutMs = Number(process.env["NERVE_AGENT_TIMEOUT_MS"] ?? 120000);
    const maxOutput = Number(process.env["NERVE_AGENT_MAX_OUTPUT"] ?? 262144);
    const res = await spawnAdapter(spec.bin, argv, { cwd: jobDir, timeoutMs, maxOutput });
    if (res.timedOut) {
      db.query(
        "INSERT INTO agent_runs(id,adapter,job_type,cache_key,prompt_version,status,started_at,finished_at,est_tokens,reported_tokens,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(runId, args.adapter, args.jobType, cacheKey, compiled.promptVersion, "error", started, nowIso(), estimateTokens(compiled.prompt, ""), null, "agent timed out");
      return { proposalId: null, runId, cacheHit: false, tokenEstimate: estimateTokens(compiled.prompt, ""), error: "agent timed out" };
    }
    let parsed;
    let reported: number | null = null;
    try {
      const p = spec.parseStdout(res.stdout);
      parsed = validateProposalJson(p.proposalJson);
      reported = p.reportedTokens;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "invalid agent output";
      db.query(
        "INSERT INTO agent_runs(id,adapter,job_type,cache_key,prompt_version,status,started_at,finished_at,est_tokens,reported_tokens,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).run(runId, args.adapter, args.jobType, cacheKey, compiled.promptVersion, "error", started, nowIso(), estimateTokens(compiled.prompt, res.stdout.slice(0, 4000)), null, msg.slice(0, 1000));
      return { proposalId: null, runId, cacheHit: false, tokenEstimate: estimateTokens(compiled.prompt, res.stdout.slice(0, 4000)), error: msg };
    }
    const canonical = JSON.stringify({ rationale: parsed.rationale, changes: parsed.changes, evidence: parsed.evidence, affected: parsed.affected });
    const tokenEstimate = estimateTokens(compiled.prompt, canonical);
    db.query("INSERT OR REPLACE INTO job_cache(cache_key, result_json, created_at) VALUES (?,?,?)").run(cacheKey, canonical, nowIso());
    const proposalId = createProposal(db, {
      job_type: args.jobType,
      rationale: parsed.rationale,
      changes: parsed.changes,
      evidence: parsed.evidence,
      affected: parsed.affected,
      adapter: args.adapter,
      cacheHit: false,
      tokenEstimate,
    });
    db.query(
      "INSERT INTO agent_runs(id,adapter,job_type,cache_key,prompt_version,status,started_at,finished_at,est_tokens,reported_tokens,error) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(runId, args.adapter, args.jobType, cacheKey, compiled.promptVersion, "ok", started, nowIso(), tokenEstimate, reported, "");
    return { proposalId, runId, cacheHit: false, tokenEstimate };
  } finally {
    // The packet holds scoped founder data; never accumulate it in /tmp.
    try { rmSync(jobDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
