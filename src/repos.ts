import type { Database } from "bun:sqlite";
import { newId, nowIso } from "./db.ts";
import type { Bet, Outcome, Proposal, Signal, Task, Vision } from "./types.ts";
import { optDate, optText, oneOf, reqIso, reqTitle } from "./validate.ts";

export const dbGet = {
  vision(db: Database): Vision {
    const row = db.query("SELECT text, revision, updated_at FROM vision WHERE id = 1").get() as Vision | null;
    if (!row) throw new Error("vision missing");
    return row;
  },
  outcomes(db: Database): Outcome[] {
    return db.query("SELECT * FROM outcomes ORDER BY updated_at DESC").all() as Outcome[];
  },
  outcome(db: Database, id: string): Outcome | null {
    return db.query("SELECT * FROM outcomes WHERE id = ?").get(id) as Outcome | null;
  },
  bets(db: Database): Bet[] {
    return db.query("SELECT * FROM bets ORDER BY updated_at DESC").all() as Bet[];
  },
  bet(db: Database, id: string): Bet | null {
    return db.query("SELECT * FROM bets WHERE id = ?").get(id) as Bet | null;
  },
  tasks(db: Database): Task[] {
    return db.query("SELECT * FROM tasks ORDER BY updated_at DESC").all() as Task[];
  },
  task(db: Database, id: string): Task | null {
    return db.query("SELECT * FROM tasks WHERE id = ?").get(id) as Task | null;
  },
  signals(db: Database): Signal[] {
    return db.query("SELECT * FROM signals ORDER BY occurred_at DESC LIMIT 200").all() as Signal[];
  },
  signal(db: Database, id: string): Signal | null {
    return db.query("SELECT * FROM signals WHERE id = ?").get(id) as Signal | null;
  },
  proposals(db: Database): Proposal[] {
    return db.query("SELECT * FROM proposals ORDER BY created_at DESC LIMIT 100").all() as Proposal[];
  },
  proposal(db: Database, id: string): Proposal | null {
    return db.query("SELECT * FROM proposals WHERE id = ?").get(id) as Proposal | null;
  },
};

export const dbMut = {
  setVision(db: Database, text: string): Vision {
    const t = text.trim();
    if (!t) throw new Error("vision text is required");
    if (t.length > 8000) throw new Error("vision text too long");
    const cur = dbGet.vision(db);
    const now = nowIso();
    db.query("INSERT INTO vision_history(text, revision, created_at) VALUES (?,?,?)").run(cur.text, cur.revision, now);
    db.query("UPDATE vision SET text = ?, revision = revision + 1, updated_at = ? WHERE id = 1").run(t, now);
    return dbGet.vision(db);
  },

  createOutcome(db: Database, b: Record<string, unknown>): Outcome {
    const row: Outcome = {
      id: newId(),
      title: reqTitle(b["title"]),
      description: optText(b["description"], "description"),
      status: oneOf(b["status"], "status", ["active", "done", "archived"] as const, "active"),
      confidence: oneOf(b["confidence"], "confidence", ["low", "medium", "high"] as const, "medium"),
      target_date: optDate(b["target_date"], "target_date"),
      revision: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.query(
      "INSERT INTO outcomes(id,title,description,status,confidence,target_date,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).run(row.id, row.title, row.description, row.status, row.confidence, row.target_date, 1, row.created_at, row.updated_at);
    return row;
  },

  updateOutcome(db: Database, id: string, b: Record<string, unknown>): Outcome {
    const cur = dbGet.outcome(db, id);
    if (!cur) throw new Error("outcome not found");
    const next: Outcome = {
      ...cur,
      title: b["title"] !== undefined ? reqTitle(b["title"]) : cur.title,
      description: b["description"] !== undefined ? optText(b["description"], "description") : cur.description,
      status: b["status"] !== undefined ? oneOf(b["status"], "status", ["active", "done", "archived"] as const) : cur.status,
      confidence: b["confidence"] !== undefined ? oneOf(b["confidence"], "confidence", ["low", "medium", "high"] as const) : cur.confidence,
      target_date: b["target_date"] !== undefined ? optDate(b["target_date"], "target_date") : cur.target_date,
      revision: cur.revision + 1,
      updated_at: nowIso(),
    };
    db.query("UPDATE outcomes SET title=?,description=?,status=?,confidence=?,target_date=?,revision=?,updated_at=? WHERE id=?").run(
      next.title, next.description, next.status, next.confidence, next.target_date, next.revision, next.updated_at, id,
    );
    return next;
  },

  deleteOutcome(db: Database, id: string): void {
    const r = db.query("DELETE FROM outcomes WHERE id = ?").run(id);
    if (r.changes === 0) throw new Error("outcome not found");
  },

  createBet(db: Database, b: Record<string, unknown>): Bet {
    const outcomeId = b["outcome_id"] === undefined || b["outcome_id"] === null || b["outcome_id"] === "" ? null : String(b["outcome_id"]);
    if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
    const row: Bet = {
      id: newId(),
      outcome_id: outcomeId,
      title: reqTitle(b["title"]),
      assumption: optText(b["assumption"], "assumption"),
      rationale: optText(b["rationale"], "rationale"),
      confidence: oneOf(b["confidence"], "confidence", ["low", "medium", "high"] as const, "medium"),
      status: oneOf(b["status"], "status", ["open", "supported", "refuted", "archived"] as const, "open"),
      review_date: optDate(b["review_date"], "review_date"),
      revision: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.query(
      "INSERT INTO bets(id,outcome_id,title,assumption,rationale,confidence,status,review_date,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    ).run(row.id, row.outcome_id, row.title, row.assumption, row.rationale, row.confidence, row.status, row.review_date, 1, row.created_at, row.updated_at);
    return row;
  },

  updateBet(db: Database, id: string, b: Record<string, unknown>): Bet {
    const cur = dbGet.bet(db, id);
    if (!cur) throw new Error("bet not found");
    const outcomeId =
      b["outcome_id"] !== undefined
        ? b["outcome_id"] === null || b["outcome_id"] === ""
          ? null
          : String(b["outcome_id"])
        : cur.outcome_id;
    if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
    const next: Bet = {
      ...cur,
      outcome_id: outcomeId,
      title: b["title"] !== undefined ? reqTitle(b["title"]) : cur.title,
      assumption: b["assumption"] !== undefined ? optText(b["assumption"], "assumption") : cur.assumption,
      rationale: b["rationale"] !== undefined ? optText(b["rationale"], "rationale") : cur.rationale,
      confidence: b["confidence"] !== undefined ? oneOf(b["confidence"], "confidence", ["low", "medium", "high"] as const) : cur.confidence,
      status: b["status"] !== undefined ? oneOf(b["status"], "status", ["open", "supported", "refuted", "archived"] as const) : cur.status,
      review_date: b["review_date"] !== undefined ? optDate(b["review_date"], "review_date") : cur.review_date,
      revision: cur.revision + 1,
      updated_at: nowIso(),
    };
    db.query("UPDATE bets SET outcome_id=?,title=?,assumption=?,rationale=?,confidence=?,status=?,review_date=?,revision=?,updated_at=? WHERE id=?").run(
      next.outcome_id, next.title, next.assumption, next.rationale, next.confidence, next.status, next.review_date, next.revision, next.updated_at, id,
    );
    return next;
  },

  deleteBet(db: Database, id: string): void {
    const r = db.query("DELETE FROM bets WHERE id = ?").run(id);
    if (r.changes === 0) throw new Error("bet not found");
  },

  createTask(db: Database, b: Record<string, unknown>): Task {
    const outcomeId = normLink(b["outcome_id"]);
    const betId = normLink(b["bet_id"]);
    if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
    if (betId && !dbGet.bet(db, betId)) throw new Error("bet not found");
    const row: Task = {
      id: newId(),
      title: reqTitle(b["title"]),
      status: oneOf(b["status"], "status", ["open", "doing", "done", "dropped"] as const, "open"),
      priority: oneOf(b["priority"], "priority", ["p0", "p1", "p2", "p3"] as const, "p2"),
      deadline: optDate(b["deadline"], "deadline"),
      outcome_id: outcomeId,
      bet_id: betId,
      blocked: b["blocked"] === 1 || b["blocked"] === true ? 1 : 0,
      revision: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db.query("INSERT INTO tasks(id,title,status,priority,deadline,outcome_id,bet_id,blocked,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      row.id, row.title, row.status, row.priority, row.deadline, row.outcome_id, row.bet_id, row.blocked, 1, row.created_at, row.updated_at,
    );
    return row;
  },

  updateTask(db: Database, id: string, b: Record<string, unknown>): Task {
    const cur = dbGet.task(db, id);
    if (!cur) throw new Error("task not found");
    const outcomeId = b["outcome_id"] !== undefined ? normLink(b["outcome_id"]) : cur.outcome_id;
    const betId = b["bet_id"] !== undefined ? normLink(b["bet_id"]) : cur.bet_id;
    if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
    if (betId && !dbGet.bet(db, betId)) throw new Error("bet not found");
    const next: Task = {
      ...cur,
      title: b["title"] !== undefined ? reqTitle(b["title"]) : cur.title,
      status: b["status"] !== undefined ? oneOf(b["status"], "status", ["open", "doing", "done", "dropped"] as const) : cur.status,
      priority: b["priority"] !== undefined ? oneOf(b["priority"], "priority", ["p0", "p1", "p2", "p3"] as const) : cur.priority,
      deadline: b["deadline"] !== undefined ? optDate(b["deadline"], "deadline") : cur.deadline,
      outcome_id: outcomeId,
      bet_id: betId,
      blocked: b["blocked"] !== undefined ? (b["blocked"] === 1 || b["blocked"] === true ? 1 : 0) : cur.blocked,
      revision: cur.revision + 1,
      updated_at: nowIso(),
    };
    db.query("UPDATE tasks SET title=?,status=?,priority=?,deadline=?,outcome_id=?,bet_id=?,blocked=?,revision=?,updated_at=? WHERE id=?").run(
      next.title, next.status, next.priority, next.deadline, next.outcome_id, next.bet_id, next.blocked, next.revision, next.updated_at, id,
    );
    return next;
  },

  deleteTask(db: Database, id: string): void {
    const r = db.query("DELETE FROM tasks WHERE id = ?").run(id);
    if (r.changes === 0) throw new Error("task not found");
  },

  createSignal(db: Database, b: Record<string, unknown>): Signal {
    const outcomeId = normLink(b["outcome_id"]);
    const betId = normLink(b["bet_id"]);
    if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
    if (betId && !dbGet.bet(db, betId)) throw new Error("bet not found");
    const row: Signal = {
      id: newId(),
      title: reqTitle(b["title"]),
      kind: oneOf(b["kind"], "kind", ["note", "metric", "quote", "event"] as const, "note"),
      evidence: optText(b["evidence"], "evidence"),
      outcome_id: outcomeId,
      bet_id: betId,
      occurred_at: b["occurred_at"] !== undefined ? reqIso(b["occurred_at"], "occurred_at") : nowIso(),
      created_at: nowIso(),
    };
    db.query("INSERT INTO signals(id,title,kind,evidence,outcome_id,bet_id,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?)").run(
      row.id, row.title, row.kind, row.evidence, row.outcome_id, row.bet_id, row.occurred_at, row.created_at,
    );
    return row;
  },

  deleteSignal(db: Database, id: string): void {
    const r = db.query("DELETE FROM signals WHERE id = ?").run(id);
    if (r.changes === 0) throw new Error("signal not found");
  },
};

function normLink(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new Error("link must be a string id or null");
  return v;
}
