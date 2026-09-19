import type { Database } from "bun:sqlite";
import { newId, nowIso } from "./db.ts";
import { dbGet } from "./repos.ts";
import type { ProposalChange } from "./types.ts";
import { validateProposalJson } from "./validate.ts";

// Transactional proposal application with stale-revision guards.
// Only whitelisted entity/field ops (validated in validate.ts) are applied.

export function createProposal(
  db: Database,
  args: { job_type: string; rationale: string; changes: ProposalChange[]; evidence: string[]; affected: { entity: string; id: string }[]; adapter: string | null; cacheHit: boolean; tokenEstimate: number },
): string {
  const id = newId();
  db.query(
    "INSERT INTO proposals(id,job_type,status,rationale,changes_json,evidence_json,affected_json,adapter,cache_hit,token_estimate,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id, args.job_type, "pending", args.rationale, JSON.stringify(args.changes), JSON.stringify(args.evidence),
    JSON.stringify(args.affected), args.adapter, args.cacheHit ? 1 : 0, args.tokenEstimate, nowIso(),
  );
  return id;
}

export function getCurrentRevision(db: Database, entity: ProposalChange["entity"], id?: string): number | null {
  if (entity === "vision") return dbGet.vision(db).revision;
  if (!id) return null;
  if (entity === "outcome") return dbGet.outcome(db, id)?.revision ?? null;
  if (entity === "bet") return dbGet.bet(db, id)?.revision ?? null;
  if (entity === "task") return dbGet.task(db, id)?.revision ?? null;
  return null;
}

function asSql(v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  throw new Error("invalid value type");
}

function applyChange(db: Database, c: ProposalChange): void {
  const v = c.value as Record<string, unknown>;
  if (c.entity === "vision") {
    if (c.op === "update") {
      if (c.expectedRevision !== undefined) {
        const cur = dbGet.vision(db).revision;
        if (cur !== c.expectedRevision) throw new Error(`stale vision: expected revision ${c.expectedRevision}, current ${cur}`);
      }
      const text = String(v["text"] ?? "").trim();
      if (!text) throw new Error("vision text must not be blank");
      const cur = dbGet.vision(db);
      const now = nowIso();
      db.query("INSERT INTO vision_history(text, revision, created_at) VALUES (?,?,?)").run(cur.text, cur.revision, now);
      db.query("UPDATE vision SET text=?, revision=revision+1, updated_at=? WHERE id=1").run(text, now);
      return;
    }
    throw new Error("vision supports only update");
  }
  if (c.entity === "outcome") {
    if (c.op === "create") {
      const row = { id: newId(), revision: 1, created_at: nowIso(), updated_at: nowIso() };
      db.query("INSERT INTO outcomes(id,title,description,status,confidence,target_date,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
        row.id, String(v["title"] ?? ""), String(v["description"] ?? ""), (v["status"] as string) ?? "active",
        (v["confidence"] as string) ?? "medium", (v["target_date"] as string | null) ?? null, 1, row.created_at, row.updated_at,
      );
      return;
    }
    if (!c.id) throw new Error("outcome update requires id");
    const cur = dbGet.outcome(db, c.id);
    if (!cur) throw new Error(`outcome ${c.id} not found`);
    if (c.expectedRevision !== undefined && cur.revision !== c.expectedRevision) {
      throw new Error(`stale outcome ${c.id}: expected ${c.expectedRevision}, current ${cur.revision}`);
    }
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    for (const k of ["title", "description", "status", "confidence", "target_date"]) {
      if (k in v) {
        sets.push(`${k} = ?`);
        params.push(v[k] === "" && k === "target_date" ? null : asSql(v[k]));
      }
    }
    sets.push("revision = revision + 1", "updated_at = ?");
    params.push(nowIso());
    db.query(`UPDATE outcomes SET ${sets.join(", ")} WHERE id = ?`).run(...params, c.id);
    return;
  }
  if (c.entity === "bet") {
    if (c.op === "create") {
      const row = { id: newId(), created_at: nowIso(), updated_at: nowIso() };
      const outcomeId = (v["outcome_id"] as string) || null;
      if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
      db.query("INSERT INTO bets(id,outcome_id,title,assumption,rationale,confidence,status,review_date,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
        row.id, outcomeId, String(v["title"] ?? ""), String(v["assumption"] ?? ""), String(v["rationale"] ?? ""),
        (v["confidence"] as string) ?? "medium", (v["status"] as string) ?? "open", (v["review_date"] as string | null) ?? null,
        1, row.created_at, row.updated_at,
      );
      return;
    }
    if (!c.id) throw new Error("bet update requires id");
    const cur = dbGet.bet(db, c.id);
    if (!cur) throw new Error(`bet ${c.id} not found`);
    if (c.expectedRevision !== undefined && cur.revision !== c.expectedRevision) throw new Error(`stale bet ${c.id}`);
    if (v["outcome_id"] !== undefined && v["outcome_id"] !== null && typeof v["outcome_id"] === "string" && !dbGet.outcome(db, v["outcome_id"] as string)) {
      throw new Error("outcome not found");
    }
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    for (const k of ["title", "assumption", "rationale", "confidence", "status", "review_date", "outcome_id"]) {
      if (k in v) {
        sets.push(`${k} = ?`);
        if (v[k] === "" && (k === "review_date" || k === "outcome_id")) params.push(null);
        else params.push(asSql(v[k]));
      }
    }
    sets.push("revision = revision + 1", "updated_at = ?");
    params.push(nowIso());
    db.query(`UPDATE bets SET ${sets.join(", ")} WHERE id = ?`).run(...params, c.id);
    return;
  }
  if (c.entity === "task") {
    if (c.op === "create") {
      const row = { id: newId(), created_at: nowIso(), updated_at: nowIso() };
      const outcomeId = (v["outcome_id"] as string) || null;
      const betId = (v["bet_id"] as string) || null;
      if (outcomeId && !dbGet.outcome(db, outcomeId)) throw new Error("outcome not found");
      if (betId && !dbGet.bet(db, betId)) throw new Error("bet not found");
      db.query("INSERT INTO tasks(id,title,status,priority,deadline,outcome_id,bet_id,blocked,revision,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
        row.id, String(v["title"] ?? ""), (v["status"] as string) ?? "open", (v["priority"] as string) ?? "p2",
        (v["deadline"] as string | null) ?? null, outcomeId, betId, v["blocked"] === 1 || v["blocked"] === true ? 1 : 0,
        1, row.created_at, row.updated_at,
      );
      return;
    }
    if (!c.id) throw new Error("task update requires id");
    const cur = dbGet.task(db, c.id);
    if (!cur) throw new Error(`task ${c.id} not found`);
    if (c.expectedRevision !== undefined && cur.revision !== c.expectedRevision) throw new Error(`stale task ${c.id}`);
    if (v["outcome_id"] !== undefined && v["outcome_id"] !== null && typeof v["outcome_id"] === "string" && !dbGet.outcome(db, v["outcome_id"] as string)) {
      throw new Error("outcome not found");
    }
    if (v["bet_id"] !== undefined && v["bet_id"] !== null && typeof v["bet_id"] === "string" && !dbGet.bet(db, v["bet_id"] as string)) {
      throw new Error("bet not found");
    }
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    for (const k of ["title", "status", "priority", "deadline", "outcome_id", "bet_id", "blocked"]) {
      if (k in v) {
        sets.push(`${k} = ?`);
        if (v[k] === "" && (k === "deadline" || k === "outcome_id" || k === "bet_id")) params.push(null);
        else if (k === "blocked") params.push(v[k] === 1 || v[k] === true ? 1 : 0);
        else params.push(asSql(v[k]));
      }
    }
    sets.push("revision = revision + 1", "updated_at = ?");
    params.push(nowIso());
    db.query(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params, c.id);
    return;
  }
  throw new Error(`unknown entity ${c.entity}`);
}

export function acceptProposal(db: Database, proposalId: string, note = ""): void {
  const p = dbGet.proposal(db, proposalId);
  if (!p) throw new Error("proposal not found");
  if (p.status !== "pending") throw new Error("proposal already decided");
  const parsed = validateProposalJson({ rationale: p.rationale, changes: JSON.parse(p.changes_json), evidence: JSON.parse(p.evidence_json), affected: JSON.parse(p.affected_json) });
  const txn = db.transaction(() => {
    for (const c of parsed.changes) applyChange(db, c);
    const now = nowIso();
    db.query("UPDATE proposals SET status='accepted', decided_at=? WHERE id=?").run(now, proposalId);
    db.query("INSERT INTO decisions(id, proposal_id, action, note, created_at) VALUES (?,?,?,?,?)").run(newId(), proposalId, "accepted", note.slice(0, 2000), now);
  });
  txn();
}

export function rejectProposal(db: Database, proposalId: string, note = ""): void {
  const p = dbGet.proposal(db, proposalId);
  if (!p) throw new Error("proposal not found");
  if (p.status !== "pending") throw new Error("proposal already decided");
  const now = nowIso();
  const txn = db.transaction(() => {
    db.query("UPDATE proposals SET status='rejected', decided_at=? WHERE id=?").run(now, proposalId);
    db.query("INSERT INTO decisions(id, proposal_id, action, note, created_at) VALUES (?,?,?,?,?)").run(newId(), proposalId, "rejected", note.slice(0, 2000), now);
  });
  txn();
}
