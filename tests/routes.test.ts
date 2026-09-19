import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Route-level coverage for the HTTP surface the new UI controls use
// (PATCH/DELETE /api/outcomes|bets|tasks/:id, DELETE /api/signals/:id)
// plus the write-guard header requirement (src/http-security.ts).
// Boots the real src/server.ts with a temp NERVE_DB, using the UI's exact
// headers (content-type: application/json on writes, see web/api.ts).

let base = "";
let tmp = "";
let proc: ReturnType<typeof Bun.spawn> | null = null;

const JSON_HEADERS = { "content-type": "application/json" };

async function req(method: string, path: string, body?: unknown, withJsonHeader = true): Promise<Response> {
  const init: RequestInit = { method };
  if (withJsonHeader && method !== "GET" && method !== "HEAD") {
    init.headers = { ...JSON_HEADERS };
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return fetch(`${base}${path}`, init);
}

async function reqJson<T>(method: string, path: string, body?: unknown, withJsonHeader = true): Promise<{ status: number; data: T }> {
  const res = await req(method, path, body, withJsonHeader);
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null as unknown as T;
  }
  return { status: res.status, data: data as T };
}

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), "nerve-routes-"));
  const dbPath = join(tmp, "test.db");
  const port = String(34900 + Math.floor(Math.random() * 900));
  base = `http://127.0.0.1:${port}`;
  proc = Bun.spawn(["bun", "run", "src/server.ts"], {
    cwd: import.meta.dir + "/..",
    env: { ...process.env, NERVE_DB: dbPath, PORT: port, HOST: "127.0.0.1" },
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = Date.now() + 15000;
  for (;;) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    if (Date.now() > deadline) throw new Error("test server did not start in time");
    await new Promise((r) => setTimeout(r, 100));
  }
});

afterAll(() => {
  try {
    proc?.kill();
  } catch {
    // already exited
  }
  proc = null;
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

describe("HTTP routes used by the new UI controls", () => {
  test("outcomes PATCH then DELETE", async () => {
    const created = await reqJson<{ id: string }>("POST", "/api/outcomes", { title: "route o" });
    expect(created.status).toBe(201);
    const patched = await reqJson<{ description: string; target_date: string; revision: number }>(
      "PATCH",
      `/api/outcomes/${created.data.id}`,
      { description: "how we know", target_date: "2027-01-15" },
    );
    expect(patched.status).toBe(200);
    expect(patched.data.description).toBe("how we know");
    expect(patched.data.target_date).toBe("2027-01-15");
    expect(patched.data.revision).toBe(2);
    const bad = await reqJson("PATCH", `/api/outcomes/${created.data.id}`, { title: "   " });
    expect(bad.status).toBe(400);
    const del = await reqJson<{ ok: boolean }>("DELETE", `/api/outcomes/${created.data.id}`, {});
    expect(del.status).toBe(200);
    expect(del.data.ok).toBe(true);
  });

  test("bets PATCH then DELETE", async () => {
    const o = await reqJson<{ id: string }>("POST", "/api/outcomes", { title: "bet parent" });
    expect(o.status).toBe(201);
    const created = await reqJson<{ id: string }>("POST", "/api/bets", { title: "route b", assumption: "a" });
    expect(created.status).toBe(201);
    const patched = await reqJson<{ title: string; outcome_id: string }>(
      "PATCH",
      `/api/bets/${created.data.id}`,
      { title: "route b2", assumption: "a2", rationale: "why", outcome_id: o.data.id },
    );
    expect(patched.status).toBe(200);
    expect(patched.data.title).toBe("route b2");
    expect(patched.data.outcome_id).toBe(o.data.id);
    const del = await reqJson<{ ok: boolean }>("DELETE", `/api/bets/${created.data.id}`, {});
    expect(del.status).toBe(200);
    expect(del.data.ok).toBe(true);
  });

  test("tasks PATCH then DELETE", async () => {
    const created = await reqJson<{ id: string }>("POST", "/api/tasks", { title: "route t" });
    expect(created.status).toBe(201);
    const patched = await reqJson<{ title: string; priority: string; revision: number }>(
      "PATCH",
      `/api/tasks/${created.data.id}`,
      { title: "route t2", deadline: "2026-10-01", priority: "p0" },
    );
    expect(patched.status).toBe(200);
    expect(patched.data.title).toBe("route t2");
    expect(patched.data.revision).toBe(2);
    const bad = await reqJson("PATCH", `/api/tasks/${created.data.id}`, { deadline: "tomorrow" });
    expect(bad.status).toBe(400);
    const del = await reqJson<{ ok: boolean }>("DELETE", `/api/tasks/${created.data.id}`, {});
    expect(del.status).toBe(200);
    expect(del.data.ok).toBe(true);
  });

  test("signals DELETE", async () => {
    const created = await reqJson<{ id: string }>("POST", "/api/signals", {
      title: "route s",
      occurred_at: new Date().toISOString(),
    });
    expect(created.status).toBe(201);
    const del = await reqJson<{ ok: boolean }>("DELETE", `/api/signals/${created.data.id}`, {});
    expect(del.status).toBe(200);
    expect(del.data.ok).toBe(true);
  });

  test("write guard rejects missing content-type (DELETE without the UI header)", async () => {
    const created = await reqJson<{ id: string }>("POST", "/api/tasks", { title: "guard t" });
    expect(created.status).toBe(201);
    const guarded = await reqJson("DELETE", `/api/tasks/${created.data.id}`, undefined, false);
    expect(guarded.status).toBe(400);
    // Cleanup with the correct header still works.
    const del = await reqJson<{ ok: boolean }>("DELETE", `/api/tasks/${created.data.id}`, {});
    expect(del.status).toBe(200);
  });
});
