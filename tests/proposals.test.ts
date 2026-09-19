import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, openDb } from "../src/db.ts";
import { dbGet, dbMut } from "../src/repos.ts";
import { acceptProposal, createProposal, rejectProposal } from "../src/proposals.ts";
import { validateProposalJson } from "../src/validate.ts";

function mem(): Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}

describe("proposals: transactional approval + stale guards", () => {
  test("accept applies whitelisted changes and writes decision", () => {
    const db = mem();
    dbMut.setVision(db, "old vision");
    const o = dbMut.createOutcome(db, { title: "O" });
    const pid = createProposal(db, {
      job_type: "replan-work", rationale: "r", evidence: ["e"],
      changes: [
        { entity: "outcome", op: "update", id: o.id, expectedRevision: 1, value: { status: "done" } },
        { entity: "task", op: "create", value: { title: "follow-up", priority: "p1" } },
      ],
      affected: [], adapter: "codex", cacheHit: false, tokenEstimate: 10,
    });
    acceptProposal(db, pid, "looks right");
    expect(dbGet.outcome(db, o.id)!.status).toBe("done");
    expect(dbGet.tasks(db).length).toBe(1);
    const d = db.query("SELECT action FROM decisions WHERE proposal_id = ?").get(pid) as { action: string };
    expect(d.action).toBe("accepted");
    expect(dbGet.proposal(db, pid)!.status).toBe("accepted");
  });

  test("stale expectedRevision rejects the whole transaction (no partial writes)", () => {
    const db = mem();
    const o = dbMut.createOutcome(db, { title: "O" });
    dbMut.updateOutcome(db, o.id, { title: "O2" }); // revision 2
    const pid = createProposal(db, {
      job_type: "replan-work", rationale: "r", evidence: [],
      changes: [
        { entity: "outcome", op: "update", id: o.id, expectedRevision: 1, value: { status: "done" } },
        { entity: "task", op: "create", value: { title: "should not exist" } },
      ],
      affected: [], adapter: "codex", cacheHit: false, tokenEstimate: 1,
    });
    expect(() => acceptProposal(db, pid)).toThrow(/stale/);
    expect(dbGet.outcome(db, o.id)!.status).toBe("active");
    expect(dbGet.tasks(db).length).toBe(0);
    expect(dbGet.proposal(db, pid)!.status).toBe("pending");
  });

  test("reject writes audited decision without changes; double-decide blocked", () => {
    const db = mem();
    const o = dbMut.createOutcome(db, { title: "O" });
    const pid = createProposal(db, {
      job_type: "clarify-vision", rationale: "r", evidence: [],
      changes: [{ entity: "outcome", op: "update", id: o.id, value: { status: "done" } }],
      affected: [], adapter: null, cacheHit: false, tokenEstimate: 1,
    });
    rejectProposal(db, pid, "not now");
    expect(dbGet.outcome(db, o.id)!.status).toBe("active");
    const d = db.query("SELECT action, note FROM decisions WHERE proposal_id = ?").get(pid) as { action: string; note: string };
    expect(d.action).toBe("rejected");
    expect(d.note).toBe("not now");
    expect(() => acceptProposal(db, pid)).toThrow(/already decided/);
  });

  test("untrusted proposal JSON: rejects disallowed entity/field/op", () => {
    expect(() => validateProposalJson({ rationale: "r", changes: [{ entity: "signals", op: "delete", value: {} }] })).toThrow();
    expect(() => validateProposalJson({ rationale: "r", changes: [{ entity: "task", op: "update", id: "x", value: { owner: "mallory" } }] })).toThrow();
    expect(() => validateProposalJson({ rationale: "", changes: [{ entity: "task", op: "create", value: { title: "t" } }] })).toThrow();
    expect(() => validateProposalJson({ rationale: "r", changes: [] })).toThrow();
  });

  test("untrusted proposal JSON: enforces HTTP-equivalent length caps", () => {
    expect(() => validateProposalJson({ rationale: "r", changes: [{ entity: "task", op: "create", value: { title: "x".repeat(301) } }] })).toThrow(/too long/);
    expect(() => validateProposalJson({ rationale: "r", changes: [{ entity: "bet", op: "create", value: { title: "t", assumption: "y".repeat(8001) } }] })).toThrow(/too long/);
    expect(() => validateProposalJson({ rationale: "r", changes: [{ entity: "task", op: "create", value: { title: "ok" } }], affected: Array.from({ length: 21 }, (_, i) => ({ entity: "task", id: String(i) })) })).toThrow();
  });
});
