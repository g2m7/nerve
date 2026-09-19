import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate, openDb } from "../src/db.ts";
import { dbGet } from "../src/repos.ts";
import { resetDetectCache, runJob } from "../src/agents/runner.ts";

function mem(): Database {
  const db = openDb(":memory:");
  migrate(db);
  return db;
}

// Fake `pi` CLI on PATH: exit 0 on --version, else print `body` to stdout.
// Detection probes the bare id (`pi --version`); the run uses NERVE_PI_BIN.
let fakeDirs: string[] = [];
const savedPath = process.env["PATH"];
const savedPiBin = process.env["NERVE_PI_BIN"];

function installFakePi(body: string): void {
  resetDetectCache();
  const dir = join(tmpdir(), `nerve-fake-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  const bin = join(dir, "pi");
  writeFileSync(bin, `#!/bin/sh\nif [ "$1" = "--version" ]; then exit 0; fi\n/bin/cat <<'EOF'\n${body}\nEOF\n`);
  chmodSync(bin, 0o755);
  fakeDirs.push(dir);
  process.env["PATH"] = `${dir}:${savedPath ?? ""}`;
  process.env["NERVE_PI_BIN"] = bin;
}

afterEach(() => {
  for (const d of fakeDirs) rmSync(d, { recursive: true, force: true });
  fakeDirs = [];
  process.env["PATH"] = savedPath;
  if (savedPiBin === undefined) delete process.env["NERVE_PI_BIN"];
  else process.env["NERVE_PI_BIN"] = savedPiBin;
  resetDetectCache();
});

const PROPOSAL = JSON.stringify({
  rationale: "fake rationale",
  changes: [{ entity: "task", op: "create", value: { title: "fake task" } }],
});

describe("runJob trust-boundary orchestration (faked CLI, never a real agent)", () => {
  test("first run records ok + cache miss; identical second run is a cache hit", async () => {
    installFakePi(PROPOSAL);
    const db = mem();
    const first = await runJob(db, { adapter: "pi", jobType: "weekly-review", refs: {} });
    expect(first.proposalId).not.toBeNull();
    expect(first.cacheHit).toBe(false);
    const run1 = db.query("SELECT status FROM agent_runs WHERE id = ?").get(first.runId) as { status: string };
    expect(run1.status).toBe("ok");
    expect(dbGet.tasks(db).length).toBe(0); // job never applies; founder decides

    const second = await runJob(db, { adapter: "pi", jobType: "weekly-review", refs: {} });
    expect(second.cacheHit).toBe(true);
    expect(second.proposalId).not.toBeNull();
    expect(second.proposalId).not.toBe(first.proposalId);
    const run2 = db.query("SELECT status FROM agent_runs WHERE id = ?").get(second.runId) as { status: string };
    expect(run2.status).toBe("cache-hit");
    expect(dbGet.proposals(db).length).toBe(2);
  });

  test("garbage output records an error run and no proposal", async () => {
    installFakePi("hello world, no json here at all!!!");
    const db = mem();
    const r = await runJob(db, { adapter: "pi", jobType: "weekly-review", refs: {} });
    expect(r.proposalId).toBeNull();
    expect(r.error).toBeTruthy();
    const row = db.query("SELECT status, error FROM agent_runs WHERE id = ?").get(r.runId) as { status: string; error: string };
    expect(row.status).toBe("error");
    expect(row.error.length).toBeGreaterThan(0);
    expect(dbGet.proposals(db).length).toBe(0);
  });

  test("configured binary is detected even when its default name is not on PATH", async () => {
    installFakePi(PROPOSAL);
    process.env["PATH"] = join(tmpdir(), `nerve-empty-${Math.random().toString(36).slice(2)}`);
    const db = mem();
    const r = await runJob(db, { adapter: "pi", jobType: "weekly-review", refs: {} });
    expect(r.proposalId).not.toBeNull();
  });

  test("missing CLI records unavailable and no proposal", async () => {
    resetDetectCache();
    process.env["PATH"] = join(tmpdir(), `nerve-empty-${Math.random().toString(36).slice(2)}`);
    delete process.env["NERVE_PI_BIN"];
    const db = mem();
    const r = await runJob(db, { adapter: "pi", jobType: "weekly-review", refs: {} });
    expect(r.proposalId).toBeNull();
    const row = db.query("SELECT status FROM agent_runs WHERE id = ?").get(r.runId) as { status: string };
    expect(row.status).toBe("unavailable");
  });

  test("job temp dir is removed after the run", async () => {
    installFakePi(PROPOSAL);
    const db = mem();
    const before = new Set(
      (await Array.fromAsync(new Bun.Glob("nerve-job-*").scan({ cwd: tmpdir(), onlyFiles: false }))) as string[],
    );
    await runJob(db, { adapter: "pi", jobType: "weekly-review", refs: {} });
    const after = (await Array.fromAsync(new Bun.Glob("nerve-job-*").scan({ cwd: tmpdir(), onlyFiles: false }))) as string[];
    expect(after.filter((d) => !before.has(d))).toEqual([]);
  });
});
