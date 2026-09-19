import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, openDb } from "../src/db.ts";
import { dbMut } from "../src/repos.ts";
import { buildCacheKey, compileContext, estimateTokens, PROMPT_VERSION } from "../src/context.ts";

function seeded(): Database {
  const db = openDb(":memory:");
  migrate(db);
  dbMut.setVision(db, "Calm solo business");
  const o = dbMut.createOutcome(db, { title: "10 users" });
  const b = dbMut.createBet(db, { title: "bet1", assumption: "a", outcome_id: o.id });
  dbMut.createTask(db, { title: "task linked", outcome_id: o.id, bet_id: b.id });
  dbMut.createTask(db, { title: "unrelated" });
  dbMut.createSignal(db, { title: "sig1", evidence: "e", outcome_id: o.id, bet_id: b.id, occurred_at: new Date().toISOString() });
  return db;
}

describe("context compiler", () => {
  test("static prefix has no timestamps; dynamic data last; versioned", () => {
    const db = seeded();
    const o = db.query("SELECT id FROM outcomes LIMIT 1").get() as { id: string };
    const c = compileContext(db, "challenge-bet", { outcomeId: o.id });
    expect(c.promptVersion).toBe(PROMPT_VERSION);
    expect(c.prompt).toContain("CONTEXT_JSON:");
    expect(c.prompt.indexOf("CONTEXT_JSON:")).toBeGreaterThan(10);
    expect(c.data.activeTasks.length).toBeGreaterThanOrEqual(1);
    expect(c.digest).toMatch(/^[0-9a-f]{32}$/);
  });

  test("cache key stable for same state, invalidated on state change", () => {
    const db = seeded();
    const o = db.query("SELECT id FROM outcomes LIMIT 1").get() as { id: string };
    const a = compileContext(db, "weekly-review", { outcomeId: o.id });
    const b = compileContext(db, "weekly-review", { outcomeId: o.id });
    const k = (d: string) => buildCacheKey({ adapter: "codex", model: "m", jobType: "weekly-review", promptVersion: "v1", schemaVersion: "v1", digest: d });
    expect(k(a.digest)).toBe(k(b.digest));
    dbMut.createTask(db, { title: "new task changes digest", outcome_id: o.id });
    const c = compileContext(db, "weekly-review", { outcomeId: o.id });
    expect(k(c.digest)).not.toBe(k(a.digest));
    // Different adapter/model also changes key
    expect(buildCacheKey({ adapter: "pi", model: "m", jobType: "weekly-review", promptVersion: "v1", schemaVersion: "v1", digest: a.digest })).not.toBe(k(a.digest));
  });

  test("estimateTokens deterministic", () => {
    expect(estimateTokens("abcd", "efgh")).toBe(2);
    expect(estimateTokens("abcd", "efgh")).toBe(estimateTokens("abcd", "efgh"));
  });

  test("lastDecisions are scoped to the job type", async () => {
    const { createProposal } = await import("../src/proposals.ts");
    const { rejectProposal } = await import("../src/proposals.ts");
    const db = seeded();
    const mk = (job: string, note: string) => {
      const pid = createProposal(db, {
        job_type: job, rationale: "r", evidence: [],
        changes: [{ entity: "task", op: "create", value: { title: `t-${note}` } }],
        affected: [], adapter: null, cacheHit: false, tokenEstimate: 1,
      });
      rejectProposal(db, pid, note);
    };
    mk("challenge-bet", "private-bet-note");
    const weekly = compileContext(db, "weekly-review", {});
    expect(JSON.stringify(weekly.data.lastDecisions)).not.toContain("private-bet-note");
    mk("weekly-review", "weekly-note");
    const weekly2 = compileContext(db, "weekly-review", {});
    expect(JSON.stringify(weekly2.data.lastDecisions)).toContain("weekly-note");
    expect(JSON.stringify(weekly2.data.lastDecisions)).not.toContain("private-bet-note");
  });
});
