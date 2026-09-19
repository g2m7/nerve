// Token-efficient agent bridge: jobs + adapter registry + safe spawning.
// Verified against current --help output (see README adapter notes):
// - codex 0.153.4: `codex exec --sandbox read-only --skip-git-repo-check --ephemeral [--model M] [--output-schema F --json]`.
// - agy 1.1.17: `agy -p --mode plan --sandbox --output-format json [--json-schema F] [--model M]`.
// - opencode 1.18.31: `opencode run --pure --format json [--model M] [--dir JOBDIR]`.
// - pi 0.85.1: `pi -p --mode json --no-session --no-tools --no-extensions --no-skills --no-context-files [--model M]`.
// - droid 0.221.0: `droid exec --output-format json --disable-builtin-skills --cwd JOBDIR [-m M]`.
// Never use auto-approval flags (--approve-for-me, --dangerously-skip-permissions,
// --skip-permissions-unsafe, --auto). Spawn with argv arrays only, no shell.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AdapterId, JobType } from "../types.ts";
import { OUTPUT_SCHEMA_VERSION } from "../context.ts";

export interface AdapterSpec {
  id: AdapterId;
  bin: string;
  defaultModel: string;
  configuredModel: string;
  available: boolean;
  argv: (prompt: string, job: { jobDir: string; schemaFile: string; model: string }) => string[];
  parseStdout: (stdout: string) => { proposalJson: unknown; reportedTokens: number | null };
  notes: string;
}

export interface AdapterConfig {
  bin?: string;
  model?: string;
  extraArgs?: string[];
}

const SAFE_EXTRA_FLAGS = new Set([
  "--model", "--timeout", "--max-tokens", "--max-output-tokens", "--temperature", "--top-p",
]);

// Bare (non-flag) tokens that must never pass through: sandbox escapes and
// auto-approval bypasses, whether passed as `--flag value` pairs or `--flag=value`.
const BARE_UNSAFE_RE = /^(danger-full-access|--?yolo|--dangerously-bypass-approvals-and-sandbox|--approve-for-me|--dangerously-skip-permissions|--skip-permissions-unsafe|--auto)$/i;

export function filterSafeExtraArgs(extra: string[] | undefined): string[] {
  if (!extra) return [];
  const safeValue = (value: string): boolean =>
    !!value &&
    !value.startsWith("-") &&
    !/[\n\0;|`]/.test(value) &&
    !value.includes("$(") &&
    !value.includes(" ") &&
    !value.includes("=") &&
    !BARE_UNSAFE_RE.test(value);
  const out: string[] = [];
  for (let i = 0; i < extra.length && out.length < 8; i++) {
    const raw = extra[i];
    if (typeof raw !== "string") continue;
    const token = raw.trim();
    const eq = token.indexOf("=");
    const flag = eq >= 0 ? token.slice(0, eq) : token;
    if (!SAFE_EXTRA_FLAGS.has(flag)) continue;
    if (eq >= 0) {
      const value = token.slice(eq + 1);
      if (safeValue(value)) out.push(`${flag}=${value}`);
      continue;
    }
    const next = extra[i + 1];
    if (typeof next === "string" && safeValue(next.trim())) {
      out.push(flag, next.trim());
      i++;
    }
  }
  return out.slice(0, 8);
}

// Minimal environment for spawned agent CLIs. Parent environment is not
// inherited: NERVE_DB, HOST/PORT, and non-allowlisted secrets are dropped.
// Provider keys required by CLIs are explicit exceptions; adapters are trusted
// local software and are not an OS-level isolation boundary.
const CHILD_ENV_ALLOW = [
  "PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR",
  "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "CODEX_HOME",
  "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
];

export function childEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of CHILD_ENV_ALLOW) {
    const v = process.env[k];
    if (v) out[k] = v;
  }
  return out;
}

export function outputSchemaFile(jobDir: string): string {
  const schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "NerveProposal",
    type: "object",
    required: ["rationale", "changes"],
    properties: {
      rationale: { type: "string", maxLength: 4000 },
      evidence: { type: "array", items: { type: "string" } },
      affected: { type: "array", items: { type: "object", properties: { entity: { type: "string" }, id: { type: "string" } } } },
      changes: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          required: ["entity", "op", "value"],
          properties: {
            entity: { enum: ["vision", "outcome", "bet", "task"] },
            op: { enum: ["create", "update"] },
            id: { type: "string" },
            expectedRevision: { type: "integer" },
            value: { type: "object" },
          },
        },
      },
    },
  };
  const f = join(jobDir, "output-schema.json");
  writeFileSync(f, JSON.stringify(schema));
  return f;
}

export function schemaVersion(): string {
  return OUTPUT_SCHEMA_VERSION;
}

function parseJsonLoose(stdout: string): unknown {
  const t = stdout.trim();
  // Try whole, then last JSON object in output (adapters wrap with logs).
  try {
    return JSON.parse(t);
  } catch { /* fall through */ }
  const start = t.lastIndexOf('{"rationale"');
  const alt = t.lastIndexOf('{"changes"');
  const idx = Math.max(start, alt);
  if (idx >= 0) {
    // Bracket-match from idx.
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = idx; i < t.length; i++) {
      const ch = t[i]!;
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) return JSON.parse(t.slice(idx, i + 1));
        }
      }
    }
  }
  // JSONL: find a line that parses to an object with rationale/changes.
  for (const line of t.split("\n").reverse()) {
    const s = line.trim();
    if (!s.startsWith("{")) continue;
    try {
      const o = JSON.parse(s) as Record<string, unknown>;
      if (o && typeof o === "object" && ("rationale" in o || "changes" in o)) return o;
      // opencode --format json wraps events: look for nested payload
      // opencode --format json wraps events: fall through to the bracket scan below.
    } catch { /* next */ }
  }
  throw new Error("no proposal JSON found in adapter output");
}

export function makeJobDir(): string {
  return mkdtempSync(join(tmpdir(), "nerve-job-"));
}

export function buildAdapters(env: Record<string, string | undefined>, detected: Record<AdapterId, boolean>): Record<AdapterId, AdapterSpec> {
  const cfg = (prefix: string): AdapterConfig => {
    const out: AdapterConfig = {};
    const bin = env[`NERVE_${prefix}_BIN`];
    const model = env[`NERVE_${prefix}_MODEL`];
    if (bin) out.bin = bin;
    if (model) out.model = model;
    try {
      const raw = env[`NERVE_${prefix}_EXTRA_ARGS`];
      if (raw) {
        const p: unknown = JSON.parse(raw);
        if (Array.isArray(p)) out.extraArgs = p.map(String);
      }
    } catch { /* ignore malformed extra args */ }
    return out;
  };
  const codexCfg = cfg("CODEX");
  const agyCfg = cfg("AGY");
  const ocCfg = cfg("OPENCODE");
  const piCfg = cfg("PI");
  const droidCfg = cfg("DROID");

  return {
    codex: {
      id: "codex",
      bin: codexCfg.bin || "codex",
      defaultModel: "",
      configuredModel: codexCfg.model || "",
      available: !!detected.codex,
      argv: (prompt, job) => {
        const a = ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral"];
        if (job.model) a.push("--model", job.model);
        a.push("--output-schema", job.schemaFile, "--json");
        return [...a, ...filterSafeExtraArgs(codexCfg.extraArgs), prompt];
      },
      parseStdout: (stdout) => {
        // codex --json emits JSONL events; final assistant message holds the answer.
        let lastText = "";
        for (const line of stdout.split("\n")) {
          const s = line.trim();
          if (!s.startsWith("{")) continue;
          try {
            const ev = JSON.parse(s) as Record<string, unknown>;
            const type = String(ev["type"] ?? "");
            if (type === "item.completed" || type === "thread.item.completed") {
              const item = ev["item"] as Record<string, unknown> | undefined;
              const text = String((item?.["text"] ?? "") as string);
              if (text) lastText = text;
            }
            if (type === "message" || type === "result") {
              const text = String((ev["text"] ?? ev["message"] ?? "") as string);
              if (text) lastText = text;
            }
          } catch { /* ignore non-JSON lines */ }
        }
        const src = lastText || stdout;
        return { proposalJson: parseJsonLoose(src), reportedTokens: null };
      },
      notes: "codex exec, read-only sandbox, ephemeral, no approvals.",
    },
    agy: {
      id: "agy",
      bin: agyCfg.bin || "agy",
      defaultModel: "",
      configuredModel: agyCfg.model || "",
      available: !!detected.agy,
      argv: (prompt, job) => {
        const a = ["-p", "--mode", "plan", "--sandbox", "--output-format", "json", "--json-schema", job.schemaFile];
        if (job.model) a.push("--model", job.model);
        return [...a, ...filterSafeExtraArgs(agyCfg.extraArgs), prompt];
      },
      parseStdout: (stdout) => {
        // agy --output-format json: try whole doc, else loose scan.
        try {
          const o = JSON.parse(stdout.trim()) as Record<string, unknown>;
          if (o && typeof o === "object" && ("rationale" in o || "changes" in o || "result" in o)) {
            const inner = (o["result"] ?? o["output"] ?? o) as unknown;
            const proposal = typeof inner === "string" ? parseJsonLoose(inner) : inner;
            const usage = o["usage"] as Record<string, unknown> | undefined;
            const rt = usage ? Number(usage["total_tokens"] ?? usage["totalTokens"] ?? NaN) : NaN;
            return { proposalJson: proposal, reportedTokens: Number.isFinite(rt) ? rt : null };
          }
        } catch { /* fall through */ }
        return { proposalJson: parseJsonLoose(stdout), reportedTokens: null };
      },
      notes: "agy print mode, plan + sandbox, JSON schema enforced where supported.",
    },
    opencode: {
      id: "opencode",
      bin: ocCfg.bin || "opencode",
      defaultModel: "",
      configuredModel: ocCfg.model || "",
      available: !!detected.opencode,
      argv: (prompt, job) => {
        const a = ["run", "--pure", "--format", "json", "--dir", job.jobDir];
        if (job.model) a.push("--model", job.model);
        return [...a, ...filterSafeExtraArgs(ocCfg.extraArgs), prompt];
      },
      parseStdout: (stdout) => ({ proposalJson: parseJsonLoose(stdout), reportedTokens: null }),
      notes: "opencode run in isolated job dir, pure mode, JSON events. Never --auto.",
    },
    pi: {
      id: "pi",
      bin: piCfg.bin || "pi",
      defaultModel: "",
      configuredModel: piCfg.model || "",
      available: !!detected.pi,
      argv: (prompt, job) => {
        const a = ["-p", "--mode", "json", "--no-session", "--no-tools", "--no-extensions", "--no-skills", "--no-context-files"];
        if (job.model) a.push("--model", job.model);
        return [...a, ...filterSafeExtraArgs(piCfg.extraArgs), "--", prompt];
      },
      parseStdout: (stdout) => {
        try {
          const o = JSON.parse(stdout.trim()) as Record<string, unknown>;
          // pi json mode wraps: { result/text/... }
          const inner = (o["result"] ?? o["text"] ?? o["output"] ?? o) as unknown;
          if (typeof inner === "string") return { proposalJson: parseJsonLoose(inner), reportedTokens: null };
          if (inner && typeof inner === "object") return { proposalJson: inner, reportedTokens: null };
        } catch { /* fall through */ }
        return { proposalJson: parseJsonLoose(stdout), reportedTokens: null };
      },
      notes: "pi print mode, ephemeral, no tools/extensions/skills/context files.",
    },
    droid: {
      id: "droid",
      bin: droidCfg.bin || "droid",
      defaultModel: "",
      configuredModel: droidCfg.model || "",
      available: !!detected.droid,
      argv: (prompt, job) => {
        const a = ["exec", "--output-format", "json", "--disable-builtin-skills", "--cwd", job.jobDir];
        if (job.model) a.push("--model", job.model);
        return [...a, ...filterSafeExtraArgs(droidCfg.extraArgs), prompt];
      },
      parseStdout: (stdout) => {
        try {
          const o = JSON.parse(stdout.trim()) as Record<string, unknown>;
          const inner = (o["result"] ?? o["output"] ?? o["response"] ?? o) as unknown;
          if (typeof inner === "string") return { proposalJson: parseJsonLoose(inner), reportedTokens: null };
          if (inner && typeof inner === "object" && ("rationale" in (inner as object) || "changes" in (inner as object))) {
            return { proposalJson: inner, reportedTokens: null };
          }
        } catch { /* fall through */ }
        return { proposalJson: parseJsonLoose(stdout), reportedTokens: null };
      },
      notes: "droid exec default read-only, builtin skills disabled, isolated cwd.",
    },
  };
}

export interface SpawnResult {
  stdout: string;
  timedOut: boolean;
  bytes: number;
  truncated: boolean;
}

// Safe non-shell spawn with timeout + output cap. argv arrays only.
export async function spawnAdapter(
  bin: string,
  argv: string[],
  opts: { cwd: string; timeoutMs: number; maxOutput: number },
): Promise<SpawnResult> {
  const proc = Bun.spawn([bin, ...argv], {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
    env: childEnv(),
  });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  let timedOut = false;
  const reader = proc.stdout.getReader();
  let forceKill: ReturnType<typeof setTimeout> | undefined;
  const timeout = setTimeout(() => {
    timedOut = true;
    try { proc.kill(); } catch { /* noop */ }
    // Escalate: a CLI that ignores SIGTERM must not hang the job forever.
    forceKill = setTimeout(() => { try { proc.kill("SIGKILL"); } catch { /* noop */ } }, 2000);
  }, opts.timeoutMs);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (timedOut) break;
      bytes += value.byteLength;
      if (bytes > opts.maxOutput) {
        truncated = true;
        // Keep first maxOutput bytes; drain-cancel.
        const keep = opts.maxOutput - (bytes - value.byteLength);
        if (keep > 0) chunks.push(value.slice(0, keep));
        try { proc.kill(); } catch { /* noop */ }
        break;
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    if (forceKill) clearTimeout(forceKill);
    try { reader.releaseLock(); } catch { /* noop */ }
    // Hard bound: never wait forever for a stubborn child.
    await Promise.race([proc.exited.catch(() => undefined), new Promise((res) => setTimeout(res, 5000))]);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { stdout: buf.toString("utf8"), timedOut, bytes, truncated };
}

export function jobPromptFile(jobDir: string, prompt: string, jobType: JobType): string {
  const f = join(jobDir, "job-packet.json");
  // The packet is the ONLY thing the agent sees: instructions + scoped data + schema hint.
  writeFileSync(f, JSON.stringify({ jobType, prompt, schemaVersion: OUTPUT_SCHEMA_VERSION }, null, 2));
  return f;
}

export function isJobType(v: string): v is JobType {
  return ["clarify-vision", "challenge-bet", "assess-signal", "replan-work", "weekly-review"].includes(v);
}
