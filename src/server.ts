import type { Database } from "bun:sqlite";
import { migrate, openDb } from "./db.ts";
import { dbGet, dbMut } from "./repos.ts";
import { computeNow } from "./prioritize.ts";
import { acceptProposal, rejectProposal } from "./proposals.ts";
import { adapterEnv, detectAdapters, runJob } from "./agents/runner.ts";
import { buildAdapters, isJobType } from "./agents/adapters.ts";
import { guardApiRequest, isLoopbackHost } from "./http-security.ts";
import type { AdapterId } from "./types.ts";

const HOST = process.env["HOST"] ?? "127.0.0.1";
const PORT = Number(process.env["PORT"] ?? 3030);
const DB_PATH = process.env["NERVE_DB"] ?? "./nerve.db";

if (!isLoopbackHost(HOST)) {
  console.error(`Refusing to bind non-loopback HOST=${HOST} (MVP has no auth).`);
  process.exit(1);
}

let db: Database;
try {
  db = openDb(DB_PATH);
} catch (e) {
  console.error(`Failed to open DB at ${DB_PATH}:`, e);
  process.exit(1);
}
migrate(db);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function err(e: unknown, status = 400): Response {
  const msg = e instanceof Error ? e.message : "bad request";
  return json({ error: msg }, status);
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    const j = await req.json();
    if (typeof j === "object" && j !== null) return j as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method.toUpperCase();

  // ---- read APIs ----
  if (p === "/api/health" && m === "GET") return json({ ok: true, db: DB_PATH });
  if (p === "/api/vision" && m === "GET") {
    try { return json(visionPayload()); } catch (e) { return err(e); }
  }
  if (p === "/api/vision" && m === "PUT") {
    try {
      const b = await body(req);
      if (typeof b["text"] !== "string") return err(new Error("text is required"));
      dbMut.setVision(db, b["text"] as string);
      return json(visionPayload());
    } catch (e) { return err(e); }
  }
  if (p === "/api/outcomes" && m === "GET") { try { return json(dbGet.outcomes(db)); } catch (e) { return err(e); } }
  if (p === "/api/outcomes" && m === "POST") {
    try { return json(dbMut.createOutcome(db, await body(req)), 201); } catch (e) { return err(e); }
  }
  if (p.startsWith("/api/outcomes/") && (m === "PATCH" || m === "DELETE")) {
    const id = decodeURIComponent(p.slice("/api/outcomes/".length));
    try {
      if (m === "DELETE") { dbMut.deleteOutcome(db, id); return json({ ok: true }); }
      return json(dbMut.updateOutcome(db, id, await body(req)));
    } catch (e) { return err(e); }
  }
  if (p === "/api/bets" && m === "GET") { try { return json(dbGet.bets(db)); } catch (e) { return err(e); } }
  if (p === "/api/bets" && m === "POST") {
    try { return json(dbMut.createBet(db, await body(req)), 201); } catch (e) { return err(e); }
  }
  if (p.startsWith("/api/bets/") && (m === "PATCH" || m === "DELETE")) {
    const id = decodeURIComponent(p.slice("/api/bets/".length));
    try {
      if (m === "DELETE") { dbMut.deleteBet(db, id); return json({ ok: true }); }
      return json(dbMut.updateBet(db, id, await body(req)));
    } catch (e) { return err(e); }
  }
  if (p === "/api/tasks" && m === "GET") { try { return json(dbGet.tasks(db)); } catch (e) { return err(e); } }
  if (p === "/api/tasks" && m === "POST") {
    try { return json(dbMut.createTask(db, await body(req)), 201); } catch (e) { return err(e); }
  }
  if (p.startsWith("/api/tasks/") && (m === "PATCH" || m === "DELETE")) {
    const id = decodeURIComponent(p.slice("/api/tasks/".length));
    try {
      if (m === "DELETE") { dbMut.deleteTask(db, id); return json({ ok: true }); }
      return json(dbMut.updateTask(db, id, await body(req)));
    } catch (e) { return err(e); }
  }
  if (p === "/api/signals" && m === "GET") { try { return json(dbGet.signals(db)); } catch (e) { return err(e); } }
  if (p === "/api/signals" && m === "POST") {
    try { return json(dbMut.createSignal(db, await body(req)), 201); } catch (e) { return err(e); }
  }
  if (p.startsWith("/api/signals/") && m === "DELETE") {
    const id = decodeURIComponent(p.slice("/api/signals/".length));
    try { dbMut.deleteSignal(db, id); return json({ ok: true }); } catch (e) { return err(e); }
  }
  if (p === "/api/now" && m === "GET") {
    try { return json(computeNow(dbGet.tasks(db))); } catch (e) { return err(e); }
  }
  if (p === "/api/proposals" && m === "GET") { try { return json(dbGet.proposals(db)); } catch (e) { return err(e); } }
  const acceptM = p.match(/^\/api\/proposals\/([^/]+)\/accept$/);
  if (acceptM && m === "POST") {
    try {
      const b = await body(req);
      acceptProposal(db, decodeURIComponent(acceptM[1]!), typeof b["note"] === "string" ? b["note"] : "");
      return json({ ok: true });
    } catch (e) { return err(e); }
  }
  const rejectM = p.match(/^\/api\/proposals\/([^/]+)\/reject$/);
  if (rejectM && m === "POST") {
    try {
      const b = await body(req);
      rejectProposal(db, decodeURIComponent(rejectM[1]!), typeof b["note"] === "string" ? b["note"] : "");
      return json({ ok: true });
    } catch (e) { return err(e); }
  }
  if (p === "/api/decisions" && m === "GET") {
    try {
      return json(db.query("SELECT * FROM decisions ORDER BY created_at DESC LIMIT 100").all());
    } catch (e) { return err(e); }
  }
  if (p === "/api/runs" && m === "GET") {
    try {
      return json(db.query("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 50").all());
    } catch (e) { return err(e); }
  }
  if (p === "/api/adapters" && m === "GET") {
    try {
      const detected = await detectAdapters();
      const specs = buildAdapters(adapterEnv(), detected);
      return json(
        (Object.keys(specs) as AdapterId[]).map((id) => ({
          id,
          bin: specs[id]!.bin,
          model: specs[id]!.configuredModel,
          available: specs[id]!.available,
          notes: specs[id]!.notes,
        })),
      );
    } catch (e) { return err(e); }
  }
  if (p === "/api/jobs" && m === "POST") {
    try {
      const b = await body(req);
      const adapter = String(b["adapter"] ?? "");
      const jobType = String(b["job_type"] ?? b["jobType"] ?? "");
      if (!["codex", "agy", "opencode", "pi", "droid"].includes(adapter)) return err(new Error("unknown adapter"));
      if (!isJobType(jobType)) return err(new Error("unknown job_type"));
      const refs = (b["refs"] ?? {}) as Record<string, unknown>;
      const refsOut = {
        ...(typeof refs["outcomeId"] === "string" ? { outcomeId: refs["outcomeId"] } : {}),
        ...(typeof refs["betId"] === "string" ? { betId: refs["betId"] } : {}),
        ...(typeof refs["signalId"] === "string" ? { signalId: refs["signalId"] } : {}),
      };
      // Targeted job types need a target: without one the agent would
      // reason over an empty scope while the prompt claims otherwise.
      if (jobType === "challenge-bet" && (!refsOut.betId || !dbGet.bet(db, refsOut.betId))) {
        return err(new Error("challenge-bet requires an existing refs.betId"));
      }
      if (jobType === "assess-signal" && (!refsOut.signalId || !dbGet.signal(db, refsOut.signalId))) {
        return err(new Error("assess-signal requires an existing refs.signalId"));
      }
      const result = await runJob(db, {
        adapter: adapter as AdapterId,
        jobType,
        refs: refsOut,
        ...(typeof b["model"] === "string" && b["model"] ? { model: b["model"] as string } : {}),
      });
      if (!result.proposalId) return json({ ...result, error: result.error ?? "agent unavailable" }, 502);
      const proposal = dbGet.proposal(db, result.proposalId);
      return json({ ...result, proposal }, 201);
    } catch (e) { return err(e, 500); }
  }

  // ---- static frontend (dist in production) ----
  if (m === "GET") {
    try {
      const file = p === "/" ? "/index.html" : p;
      const f = Bun.file(`dist${file}`);
      if (await f.exists()) return new Response(f);
      const idx = Bun.file("dist/index.html");
      if (await idx.exists() && !p.startsWith("/api/")) return new Response(idx, { headers: { "content-type": "text/html" } });
    } catch { /* fall through */ }
    if (p.startsWith("/api/")) return json({ error: "not found" }, 404);
  }
  return json({ error: "not found" }, 404);
}

function visionPayload(): Record<string, unknown> {
  const vision = dbGet.vision(db);
  const history = db.query("SELECT text, revision, created_at FROM vision_history ORDER BY id DESC LIMIT 10").all();
  return { ...vision, history };
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  async fetch(req) {
    // No auth in MVP: bound to loopback by default. Do not expose publicly.
    try {
      const guard = guardApiRequest(req);
      if (guard) return json({ error: guard.error }, guard.status);
      return await route(req);
    } catch (e) {
      console.error(e);
      return json({ error: "internal error" }, 500);
    }
  },
});

console.log(`Nerve listening on http://${server.hostname}:${server.port} (db: ${DB_PATH})`);
