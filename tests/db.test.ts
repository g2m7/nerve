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

  test("updateOutcome persists description and target_date (Direction edit form)", () => {
    const db = mem();
    const o = dbMut.createOutcome(db, { title: "o", description: "d0", target_date: "2026-12-31" });
    const u = dbMut.updateOutcome(db, o.id, { description: "how we know", target_date: "2027-01-15" });
    expect(u.description).toBe("how we know");
    expect(u.target_date).toBe("2027-01-15");
    expect(u.revision).toBe(2);
    const cleared = dbMut.updateOutcome(db, o.id, { target_date: null });
    expect(cleared.target_date).toBeNull();
  });

  test("updateBet persists title/assumption/rationale/outcome link; deleteBet removes (Direction edit form)", () => {
    const db = mem();
    const o1 = dbMut.createOutcome(db, { title: "o1" });
    const o2 = dbMut.createOutcome(db, { title: "o2" });
    const b = dbMut.createBet(db, { title: "b", assumption: "a" });
    const u = dbMut.updateBet(db, b.id, { title: "b2", assumption: "a2", rationale: "why", outcome_id: o1.id });
    expect(u.title).toBe("b2");
    expect(u.assumption).toBe("a2");
    expect(u.rationale).toBe("why");
    expect(u.outcome_id).toBe(o1.id);
    const relinked = dbMut.updateBet(db, b.id, { outcome_id: o2.id });
    expect(relinked.outcome_id).toBe(o2.id);
    expect(() => dbMut.updateBet(db, b.id, { outcome_id: "missing" })).toThrow();
    dbMut.deleteBet(db, b.id);
    expect(dbGet.bet(db, b.id)).toBeNull();
    expect(() => dbMut.deleteBet(db, b.id)).toThrow();
  });

  test("updateTask persists title/deadline/priority/links; deleteTask/deleteSignal remove (Focus edit + Review signal delete)", () => {
    const db = mem();
    const o = dbMut.createOutcome(db, { title: "o" });
    const b = dbMut.createBet(db, { title: "b", outcome_id: o.id });
    const t = dbMut.createTask(db, { title: "t" });
    const u = dbMut.updateTask(db, t.id, { title: "t2", deadline: "2026-10-01", priority: "p0", outcome_id: o.id, bet_id: b.id });
    expect(u.title).toBe("t2");
    expect(u.deadline).toBe("2026-10-01");
    expect(u.priority).toBe("p0");
    expect(u.outcome_id).toBe(o.id);
    expect(u.bet_id).toBe(b.id);
    const unlinked = dbMut.updateTask(db, t.id, { outcome_id: null, bet_id: null, deadline: null });
    expect(unlinked.outcome_id).toBeNull();
    expect(unlinked.bet_id).toBeNull();
    expect(unlinked.deadline).toBeNull();
    const s = dbMut.createSignal(db, { title: "s", occurred_at: new Date().toISOString() });
    dbMut.deleteSignal(db, s.id);
    expect(dbGet.signal(db, s.id)).toBeNull();
    dbMut.deleteTask(db, t.id);
    expect(dbGet.task(db, t.id)).toBeNull();
  });

  test("input validation rejects bad enum/date/blank", () => {
    const db = mem();
    expect(() => dbMut.createOutcome(db, { title: "" })).toThrow();
    expect(() => dbMut.createTask(db, { title: "t", priority: "p9" })).toThrow();
    expect(() => dbMut.createTask(db, { title: "t", deadline: "tomorrow" })).toThrow();
    expect(() => dbMut.setVision(db, "   ")).toThrow();
  });
});
