import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { migrate, openDb } from "../src/db.ts";
import { dbGet, dbMut } from "../src/repos.ts";

function mem(): Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}

describe("migrations", () => {
  test("creates all tables and seeds vision row", () => {
    const db = mem();
    const tables = (db.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    for (const t of ["vision", "vision_history", "outcomes", "bets", "tasks", "signals", "proposals", "decisions", "agent_runs", "job_cache"]) {
      expect(tables).toContain(t);
    }
    expect(dbGet.vision(db).revision).toBe(1);
  });

  test("foreign keys enforced", () => {
    const db = mem();
    expect(() => db.query("INSERT INTO bets(id,title,created_at,updated_at) VALUES ('x','t','a','b')").run()).not.toThrow();
    // outcome link to missing outcome must fail
    expect(() => db.query("INSERT INTO bets(id,outcome_id,title,created_at,updated_at) VALUES ('y','missing','t','a','b')").run()).toThrow();
  });
});

describe("repos", () => {
  test("vision update keeps history (versioned, not overwritten)", () => {
    const db = mem();
    dbMut.setVision(db, "v1 text");
    dbMut.setVision(db, "v2 text");
    const v = dbGet.vision(db);
    expect(v.text).toBe("v2 text");
    expect(v.revision).toBe(3);
    const h = db.query("SELECT COUNT(*) AS n FROM vision_history").get() as { n: number };
    expect(h.n).toBe(2);
  });

  test("outcome/bet/task/signal CRUD with links", () => {
    const db = mem();
    const o = dbMut.createOutcome(db, { title: "10 users", target_date: "2026-12-31" });
    expect(o.revision).toBe(1);
    const b = dbMut.createBet(db, { title: "bet", assumption: "a", outcome_id: o.id, review_date: "2026-10-01" });
    const t = dbMut.createTask(db, { title: "ship", priority: "p0", deadline: "2026-09-30", outcome_id: o.id, bet_id: b.id });
    expect(t.blocked).toBe(0);
    const s = dbMut.createSignal(db, { title: "sig", kind: "quote", evidence: "exact words", outcome_id: o.id, bet_id: b.id, occurred_at: new Date().toISOString() });
    expect(s.kind).toBe("quote");
    const u = dbMut.updateTask(db, t.id, { status: "doing" });
    expect(u.revision).toBe(2);
    expect(() => dbMut.createTask(db, { title: "bad", outcome_id: "nope" })).toThrow();
  });

  test("input validation rejects bad enum/date/blank", () => {
    const db = mem();
    expect(() => dbMut.createOutcome(db, { title: "" })).toThrow();
    expect(() => dbMut.createTask(db, { title: "t", priority: "p9" })).toThrow();
    expect(() => dbMut.createTask(db, { title: "t", deadline: "tomorrow" })).toThrow();
    expect(() => dbMut.setVision(db, "   ")).toThrow();
  });
});
