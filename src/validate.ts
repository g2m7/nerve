import type { JobType, ProposalChange } from "./types.ts";
import { JOB_TYPES } from "./types.ts";

// Throwing validators; server maps them to 400. Keep messages plain (no emoji).

export function reqString(v: unknown, name: string, max = 4000): string {
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  const s = v.trim();
  if (s.length > max) throw new Error(`${name} too long (max ${max})`);
  return s;
}

export function reqTitle(v: unknown, name = "title"): string {
  const s = reqString(v, name, 300);
  if (!s) throw new Error(`${name} is required`);
  return s;
}

export function optString(v: unknown, name: string, max = 8000): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  if (v.length > max) throw new Error(`${name} too long`);
  return v;
}

export function optText(v: unknown, name: string, max = 8000): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  if (v.length > max) throw new Error(`${name} too long`);
  return v;
}

export function oneOf<T extends string>(v: unknown, name: string, allowed: readonly T[], fallback?: T): T {
  if (v === undefined || v === null || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${name} is required`);
  }
  if (typeof v !== "string" || !(allowed as readonly string[]).includes(v)) {
    throw new Error(`${name} must be one of: ${allowed.join(", ")}`);
  }
  return v as T;
}

export function optDate(v: unknown, name: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return v;
}

export function optIso(v: unknown, name: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new Error(`${name} must be a string`);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new Error(`${name} must be a valid date`);
  return d.toISOString();
}

export function reqIso(v: unknown, name: string): string {
  const s = optIso(v, name);
  if (!s) throw new Error(`${name} is required`);
  return s;
}

export function reqJobType(v: unknown): JobType {
  if (typeof v !== "string" || !(JOB_TYPES as string[]).includes(v)) {
    throw new Error(`job_type must be one of: ${JOB_TYPES.join(", ")}`);
  }
  return v as JobType;
}

// ---- Proposal schema validation (trust boundary: agent stdout is untrusted) ----

const ALLOWED_CHANGE_FIELDS: Record<ProposalChange["entity"], string[]> = {
  vision: ["text"],
  outcome: ["title", "description", "status", "confidence", "target_date"],
  bet: ["title", "assumption", "rationale", "confidence", "status", "review_date", "outcome_id"],
  task: ["title", "status", "priority", "deadline", "outcome_id", "bet_id", "blocked"],
};

const ENUMS: Record<string, string[]> = {
  "outcome.status": ["active", "done", "archived"],
  "outcome.confidence": ["low", "medium", "high"],
  "bet.confidence": ["low", "medium", "high"],
  "bet.status": ["open", "supported", "refuted", "archived"],
  "task.status": ["open", "doing", "done", "dropped"],
  "task.priority": ["p0", "p1", "p2", "p3"],
};

export interface ValidProposal {
  rationale: string;
  evidence: string[];
  changes: ProposalChange[];
  affected: { entity: string; id: string }[];
}

export function validateProposalJson(raw: unknown): ValidProposal {
  if (typeof raw !== "object" || raw === null) throw new Error("proposal must be an object");
  const o = raw as Record<string, unknown>;
  const rationale = reqString(o["rationale"] ?? "", "rationale", 4000);
  if (!rationale) throw new Error("rationale is required");
  const changes = o["changes"];
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > 20) {
    throw new Error("changes must be a non-empty array (max 20)");
  }
  const evidence = o["evidence"];
  const ev: string[] =
    evidence === undefined
      ? []
      : Array.isArray(evidence)
        ? evidence.map((e) => String(e).slice(0, 1000))
        : (() => {
            throw new Error("evidence must be an array");
          })();
  const affected = o["affected"];
  if (Array.isArray(affected) && affected.length > 20) throw new Error("affected must have at most 20 entries");
  const aff: { entity: string; id: string }[] =
    affected === undefined
      ? []
      : Array.isArray(affected)
        ? affected.map((a) => {
            if (typeof a !== "object" || a === null) throw new Error("affected entries must be objects");
            const e = (a as Record<string, unknown>)["entity"];
            const i = (a as Record<string, unknown>)["id"];
            if (typeof e !== "string" || typeof i !== "string") throw new Error("affected entries need entity+id strings");
            return { entity: e, id: i };
          })
        : (() => {
            throw new Error("affected must be an array");
          })();

  const out: ProposalChange[] = changes.map((c, idx) => {
    if (typeof c !== "object" || c === null) throw new Error(`changes[${idx}] must be an object`);
    const r = c as Record<string, unknown>;
    const entity = oneOf(r["entity"], `changes[${idx}].entity`, ["vision", "outcome", "bet", "task"] as const);
    const op = oneOf(r["op"], `changes[${idx}].op`, ["create", "update"] as const);
    const value = r["value"];
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error(`changes[${idx}].value must be an object`);
    }
    const v = value as Record<string, unknown>;
    const allowed = ALLOWED_CHANGE_FIELDS[entity];
    for (const k of Object.keys(v)) {
      if (!allowed.includes(k)) throw new Error(`changes[${idx}]: field "${k}" not allowed for ${entity}`);
    }
    if (Object.keys(v).length === 0) throw new Error(`changes[${idx}].value must not be empty`);
    // Enum checks
    for (const [k, val] of Object.entries(v)) {
      if (val === null) continue; // null clears link/date fields
      const enumKey = `${entity}.${k}`;
      if (ENUMS[enumKey] && (typeof val !== "string" || !ENUMS[enumKey]!.includes(val))) {
        throw new Error(`changes[${idx}]: ${k} must be one of ${ENUMS[enumKey]!.join(", ")}`);
      }
      if ((k === "target_date" || k === "review_date" || k === "deadline") && typeof val === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        throw new Error(`changes[${idx}]: ${k} must be YYYY-MM-DD`);
      }
      if ((k === "outcome_id" || k === "bet_id") && typeof val !== "string") {
        throw new Error(`changes[${idx}]: ${k} must be a string id or null`);
      }
      if (k === "blocked" && val !== 0 && val !== 1 && val !== true && val !== false) {
        throw new Error(`changes[${idx}]: blocked must be 0/1`);
      }
      if ((k === "title" || k === "text") && typeof val === "string" && val.trim() === "") {
        throw new Error(`changes[${idx}]: ${k} must not be blank`);
      }
      // Length caps mirror the HTTP boundary (reqTitle max 300, optText max 8000)
      // so an accepted proposal cannot write what POST /api/* would refuse.
      if (k === "title" && typeof val === "string" && val.length > 300) {
        throw new Error(`changes[${idx}]: title too long (max 300)`);
      }
      if ((k === "text" || k === "description" || k === "assumption" || k === "rationale") && typeof val === "string" && val.length > 8000) {
        throw new Error(`changes[${idx}]: ${k} too long (max 8000)`);
      }
    }
    let id: string | undefined;
    if (r["id"] !== undefined) {
      if (typeof r["id"] !== "string" || !r["id"]) throw new Error(`changes[${idx}].id must be a non-empty string`);
      id = r["id"];
    }
    if (op === "update" && !id && entity !== "vision") throw new Error(`changes[${idx}]: update requires id`);
    if (op === "create" && id) throw new Error(`changes[${idx}]: create must not include id`);
    let expectedRevision: number | undefined;
    if (r["expectedRevision"] !== undefined) {
      if (typeof r["expectedRevision"] !== "number" || !Number.isInteger(r["expectedRevision"])) {
        throw new Error(`changes[${idx}].expectedRevision must be an integer`);
      }
      expectedRevision = r["expectedRevision"];
    }
    return { entity, op, ...(id !== undefined ? { id } : {}), ...(expectedRevision !== undefined ? { expectedRevision } : {}), value: v } as ProposalChange;
  });
  return { rationale, evidence: ev, changes: out, affected: aff };
}
