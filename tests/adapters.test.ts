import { describe, expect, test } from "bun:test";
import { buildAdapters, childEnv, filterSafeExtraArgs, spawnAdapter } from "../src/agents/adapters.ts";

// Adapter invocation/parser behavior with fakes only — never a real agent call.

const DETECT = { codex: true, agy: true, opencode: true, pi: true, droid: true };

describe("adapter argv safety", () => {
  test("no shell, no auto-approval flags; isolated dirs used", () => {
    const specs = buildAdapters({}, DETECT);
    const job = { jobDir: "/tmp/nerve-job-x", schemaFile: "/tmp/nerve-job-x/output-schema.json", model: "" };
    const all = [
      specs.codex.argv("prompt", job),
      specs.agy.argv("prompt", job),
      specs.opencode.argv("prompt", job),
      specs.pi.argv("prompt", job),
      specs.droid.argv("prompt", job),
    ];
    const joined = all.map((a) => a.join(" ")).join("\n");
    for (const bad of ["--approve-for-me", "--dangerously-skip-permissions", "--skip-permissions-unsafe", "--auto", "danger-full-access", ";", "|", "`"]) {
      expect(joined).not.toContain(bad);
    }
    expect(specs.codex.argv("p", job)).toContain("read-only");
    expect(specs.codex.argv("p", job)).toContain("--ephemeral");
    expect(specs.opencode.argv("p", job)).toContain("--pure");
    expect(specs.opencode.argv("p", job)).toContain("--dir");
    expect(specs.pi.argv("p", job)).toContain("--no-tools");
    expect(specs.pi.argv("p", job)).toContain("--no-session");
    expect(specs.droid.argv("p", job)).toContain("--disable-builtin-skills");
  });

  test("extra args filter drops unsafe fragments and orphan values", () => {
    expect(filterSafeExtraArgs(["--model", "x; rm -rf /", "--approve-for-me", "--auto", "ok"])).toEqual([]);
  });

  test("sandbox escape bypasses are dropped in all spellings", () => {
    expect(filterSafeExtraArgs(["--sandbox=danger-full-access"])).toEqual([]);
    expect(filterSafeExtraArgs(["--sandbox", "danger-full-access"])).toEqual([]);
    expect(filterSafeExtraArgs(["--sandbox danger-full-access"])).toEqual([]);
    expect(filterSafeExtraArgs(["danger-full-access"])).toEqual([]);
    expect(filterSafeExtraArgs(["--dangerously-bypass-approvals-and-sandbox"])).toEqual([]);
    expect(filterSafeExtraArgs(["-c", "key=value"])).toEqual([]);
    expect(filterSafeExtraArgs(["--config-file", "/tmp/unsafe.toml"])).toEqual([]);
    expect(filterSafeExtraArgs(["--yolo"])).toEqual([]);
  });

  test("allowlisted flags pass through with values", () => {
    expect(filterSafeExtraArgs(["--model=o3"])).toEqual(["--model=o3"]);
    expect(filterSafeExtraArgs(["--timeout", "30"])).toEqual(["--timeout", "30"]);
  });

  test("child env drops NERVE_DB and host secrets, keeps provider keys", () => {
    process.env["NERVE_DB"] = "/tmp/secret-test.db";
    process.env["OPENAI_API_KEY"] = "test-key";
    const env = childEnv();
    expect(env["NERVE_DB"]).toBeUndefined();
    expect(env["NERVE_PI_BIN"]).toBeUndefined();
    expect(env["HOST"]).toBeUndefined();
    expect(env["OPENAI_API_KEY"]).toBe("test-key");
    expect(env["PATH"]).toBe(process.env["PATH"]);
    delete process.env["NERVE_DB"];
    delete process.env["OPENAI_API_KEY"];
  });

  test("model override appended, never shell-joined", () => {
    const specs = buildAdapters({ NERVE_CODEX_MODEL: "o3" }, DETECT);
    const argv = specs.codex.argv("hi", { jobDir: "/tmp/j", schemaFile: "/tmp/j/s.json", model: "o3" });
    expect(argv).toContain("--model");
    expect(argv).toContain("o3");
    expect(argv.every((a) => typeof a === "string" && !a.includes("\n"))).toBe(true);
  });

  test("safe extra args stay before prompt and pi separator", () => {
    const specs = buildAdapters({
      NERVE_CODEX_EXTRA_ARGS: JSON.stringify(["--timeout", "30"]),
      NERVE_PI_EXTRA_ARGS: JSON.stringify(["--timeout", "30"]),
    }, DETECT);
    const job = { jobDir: "/tmp/j", schemaFile: "/tmp/j/s.json", model: "" };
    const codex = specs.codex.argv("PROMPT", job);
    expect(codex.indexOf("--timeout")).toBeLessThan(codex.indexOf("PROMPT"));
    const pi = specs.pi.argv("PROMPT", job);
    expect(pi.indexOf("--timeout")).toBeLessThan(pi.indexOf("--"));
    expect(pi.indexOf("--")).toBeLessThan(pi.indexOf("PROMPT"));
  });
});

describe("adapter stdout parsers (isolated, faked)", () => {
  test("codex JSONL: extracts last assistant text with proposal", async () => {
    const { buildAdapters: b } = await import("../src/agents/adapters.ts");
    const specs = b({}, DETECT);
    const proposal = JSON.stringify({ rationale: "r", changes: [{ entity: "task", op: "create", value: { title: "t" } }] });
    const stdout = [
      JSON.stringify({ type: "thread.started" }),
      JSON.stringify({ type: "item.completed", item: { text: proposal } }),
    ].join("\n");
    const { proposalJson } = specs.codex.parseStdout(stdout);
    expect((proposalJson as { rationale: string }).rationale).toBe("r");
  });

  test("pi wrapped json + droid wrapped json parsed", async () => {
    const { buildAdapters: b } = await import("../src/agents/adapters.ts");
    const specs = b({}, DETECT);
    const inner = { rationale: "r", changes: [{ entity: "task", op: "create", value: { title: "t" } }] };
    const piOut = specs.pi.parseStdout(JSON.stringify({ result: JSON.stringify(inner) }));
    expect((piOut.proposalJson as { rationale: string }).rationale).toBe("r");
    const droidOut = specs.droid.parseStdout(JSON.stringify({ result: inner }));
    expect((droidOut.proposalJson as { rationale: string }).rationale).toBe("r");
    const agyOut = specs.agy.parseStdout(JSON.stringify(inner));
    expect((agyOut.proposalJson as { rationale: string }).rationale).toBe("r");
    const ocOut = specs.opencode.parseStdout(`log line\n${JSON.stringify(inner)}\n`);
    expect((ocOut.proposalJson as { rationale: string }).rationale).toBe("r");
  });

  test("garbage output throws (treated as untrusted)", async () => {
    const { buildAdapters: b } = await import("../src/agents/adapters.ts");
    const specs = b({}, DETECT);
    expect(() => specs.pi.parseStdout("hello world, no json here at all!!!")).toThrow();
  });
});

describe("spawnAdapter caps", () => {
  test("runs argv without shell and caps output", async () => {
    // /bin/echo as a fake agent binary: no shell involved.
    const r = await spawnAdapter("/bin/echo", ["hello", "world"], { cwd: "/tmp", timeoutMs: 5000, maxOutput: 1024 });
    expect(r.timedOut).toBe(false);
    expect(r.stdout.trim()).toBe("hello world");
  });

  test("truncates oversized output", async () => {
    const r = await spawnAdapter("/usr/bin/yes", ["x"], { cwd: "/tmp", timeoutMs: 5000, maxOutput: 100 });
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(100);
  });
});
