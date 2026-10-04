import type { JobType, ProposalChange } from "./types";

export const JOB_TYPES = [
  "clarify-vision",
  "challenge-bet",
  "assess-signal",
  "replan-work",
  "weekly-review",
] as const;

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
  if (typeof v !== "string" || !(JOB_TYPES as readonly string[]).includes(v)) {
    throw new Error(`job_type must be one of: ${JOB_TYPES.join(", ")}`);
  }
  return v as JobType;
}

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
  affected: string[];
}

export function validateProposalJson(raw: unknown): ValidProposal {
  if (typeof raw !== "object" || raw === null) throw new Error("proposal must be an object");
  const o = raw as Record<string, unknown>;
  const rationale = reqString(o["rationale"] ?? "", "rationale", 4000);
  if (!rationale) throw new Error("rationale is required");

  const rawChanges = o["changes"];
  if (!Array.isArray(rawChanges) || rawChanges.length === 0 || rawChanges.length > 20) {
    throw new Error("changes must be a non-empty array (max 20)");
  }

  const rawEvidence = o["evidence"];
  const evidence: string[] = Array.isArray(rawEvidence)
    ? rawEvidence.map((e) => String(e).slice(0, 1000))
    : [];

  const rawAffected = o["affected"];
  const affected: string[] = Array.isArray(rawAffected)
    ? rawAffected.map((a) => (typeof a === "string" ? a : JSON.stringify(a)).slice(0, 500))
    : [];

  const changes: ProposalChange[] = rawChanges.map((c, idx) => {
    if (typeof c !== "object" || c === null) throw new Error(`changes[${idx}] must be an object`);
    const r = c as Record<string, unknown>;
    const entity = oneOf(r["entity"], `changes[${idx}].entity`, ["vision", "outcome", "bet", "task"] as const);
    const op = oneOf(r["op"], `changes[${idx}].op`, ["create", "update"] as const);

    const rawFields = r["fields"] ?? r["value"];
    if (typeof rawFields !== "object" || rawFields === null || Array.isArray(rawFields)) {
      throw new Error(`changes[${idx}].fields must be an object`);
    }
    const fields = rawFields as Record<string, unknown>;
    const allowed = ALLOWED_CHANGE_FIELDS[entity];
    for (const k of Object.keys(fields)) {
      if (!allowed.includes(k)) throw new Error(`changes[${idx}]: field "${k}" not allowed for ${entity}`);
    }

    for (const [k, val] of Object.entries(fields)) {
      if (val === null) continue;
      const enumKey = `${entity}.${k}`;
      if (ENUMS[enumKey] && (typeof val !== "string" || !ENUMS[enumKey]!.includes(val))) {
        throw new Error(`changes[${idx}]: ${k} must be one of ${ENUMS[enumKey]!.join(", ")}`);
      }
      if ((k === "target_date" || k === "review_date" || k === "deadline") && typeof val === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        throw new Error(`changes[${idx}]: ${k} must be YYYY-MM-DD`);
      }
      if (k === "title" && typeof val === "string" && val.length > 300) {
        throw new Error(`changes[${idx}]: title too long (max 300)`);
      }
    }

    let id: string | undefined;
    if (r["id"] !== undefined) {
      if (typeof r["id"] !== "string" || !r["id"]) throw new Error(`changes[${idx}].id must be a non-empty string`);
      id = r["id"];
    }
    if (op === "update" && !id && entity !== "vision") throw new Error(`changes[${idx}]: update requires id`);

    let expectedRevision: number | undefined;
    if (r["expectedRevision"] !== undefined) {
      if (typeof r["expectedRevision"] !== "number" || !Number.isInteger(r["expectedRevision"])) {
        throw new Error(`changes[${idx}].expectedRevision must be an integer`);
      }
      expectedRevision = r["expectedRevision"];
    }

    return {
      entity,
      op,
      id,
      expectedRevision,
      fields,
    };
  });

  return { rationale, evidence, changes, affected };
}
