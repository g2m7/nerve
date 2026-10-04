import { getDb, type DbClient } from "./db/index";
import { dbGet, dbMut } from "./db/repos";
import type { Proposal, ProposalChange } from "./types";

function newId(): string {
  return crypto.randomUUID();
}

export async function createProposalRecord(
  args: {
    job_type: string;
    rationale: string;
    changes: ProposalChange[];
    evidence: string[];
    affected: string[];
    adapter: string | null;
    cacheHit: boolean;
    tokenEstimate: number;
  },
  db?: DbClient
): Promise<string> {
  const client = db || (await getDb());
  const id = newId();
  await client.query(
    `INSERT INTO proposals (
      id, job_type, status, rationale, changes, evidence, affected,
      adapter, cache_hit, token_estimate, created_at
    ) VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      id,
      args.job_type,
      args.rationale,
      JSON.stringify(args.changes),
      JSON.stringify(args.evidence),
      JSON.stringify(args.affected),
      args.adapter,
      args.cacheHit,
      args.tokenEstimate,
    ]
  );
  return id;
}

export async function getCurrentRevision(
  entity: ProposalChange["entity"],
  id?: string,
  db?: DbClient
): Promise<number | null> {
  if (entity === "vision") {
    const v = await dbGet.vision(db);
    return v.revision;
  }
  if (!id) return null;
  if (entity === "outcome") {
    const o = await dbGet.outcome(id, db);
    return o?.revision ?? null;
  }
  if (entity === "bet") {
    const b = await dbGet.bet(id, db);
    return b?.revision ?? null;
  }
  if (entity === "task") {
    const t = await dbGet.task(id, db);
    return t?.revision ?? null;
  }
  return null;
}

async function applyChange(c: ProposalChange, tx: DbClient): Promise<void> {
  const fields = c.fields || {};
  if (c.entity === "vision") {
    if (c.op === "update") {
      if (c.expectedRevision !== undefined) {
        const cur = await dbGet.vision(tx);
        if (cur.revision !== c.expectedRevision) {
          throw new Error(`Stale vision: expected revision ${c.expectedRevision}, current is ${cur.revision}`);
        }
      }
      const text = String(fields["text"] ?? "").trim();
      if (!text) throw new Error("Vision text cannot be empty");
      await dbMut.setVision(text, tx);
      return;
    }
    throw new Error("Vision only supports update op");
  }

  if (c.entity === "outcome") {
    if (c.op === "create") {
      await dbMut.createOutcome(fields, tx);
      return;
    }
    if (c.op === "update") {
      if (!c.id) throw new Error("Outcome update requires id");
      await dbMut.updateOutcome(c.id, fields, c.expectedRevision, tx);
      return;
    }
  }

  if (c.entity === "bet") {
    if (c.op === "create") {
      await dbMut.createBet(fields, tx);
      return;
    }
    if (c.op === "update") {
      if (!c.id) throw new Error("Bet update requires id");
      await dbMut.updateBet(c.id, fields, c.expectedRevision, tx);
      return;
    }
  }

  if (c.entity === "task") {
    if (c.op === "create") {
      await dbMut.createTask(fields, tx);
      return;
    }
    if (c.op === "update") {
      if (!c.id) throw new Error("Task update requires id");
      await dbMut.updateTask(c.id, fields, c.expectedRevision, tx);
      return;
    }
  }

  throw new Error(`Unsupported entity ${c.entity} or op ${c.op}`);
}

export async function acceptProposal(proposalId: string, note = ""): Promise<void> {
  const client = await getDb();
  await client.transaction(async (tx) => {
    const p = await dbGet.proposal(proposalId, tx);
    if (!p) throw new Error(`Proposal ${proposalId} not found`);
    if (p.status !== "pending") throw new Error(`Proposal ${proposalId} is already ${p.status}`);

    for (const change of p.changes) {
      await applyChange(change, tx);
    }

    await tx.query("UPDATE proposals SET status = 'accepted', decided_at = NOW() WHERE id = $1", [proposalId]);
    await tx.query(
      "INSERT INTO decisions (id, proposal_id, action, note, created_at) VALUES ($1, $2, 'accepted', $3, NOW())",
      [newId(), proposalId, note]
    );
  });
}

export async function rejectProposal(proposalId: string, note = ""): Promise<void> {
  const client = await getDb();
  await client.transaction(async (tx) => {
    const p = await dbGet.proposal(proposalId, tx);
    if (!p) throw new Error(`Proposal ${proposalId} not found`);
    if (p.status !== "pending") throw new Error(`Proposal ${proposalId} is already ${p.status}`);

    await tx.query("UPDATE proposals SET status = 'rejected', decided_at = NOW() WHERE id = $1", [proposalId]);
    await tx.query(
      "INSERT INTO decisions (id, proposal_id, action, note, created_at) VALUES ($1, $2, 'rejected', $3, NOW())",
      [newId(), proposalId, note]
    );
  });
}
