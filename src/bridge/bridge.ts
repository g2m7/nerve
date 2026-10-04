import { buildAdapters, childEnv, jobPromptFile, makeJobDir, outputSchemaFile, spawnAdapter } from "../agents/adapters";
import { adapterEnv, detectAdapters } from "../agents/runner";
import { validateProposalJson } from "../lib/validate";
import type { AdapterId, JobType } from "../lib/types";
import { rmSync } from "node:fs";

const BRIDGE_PORT = Number(process.env["NERVE_BRIDGE_PORT"] ?? 3031);
const BRIDGE_HOST = "127.0.0.1";
const BRIDGE_AUTH_TOKEN = process.env["NERVE_BRIDGE_TOKEN"] ?? "nrv_live_bridge_secret";

function corsHeaders(req: Request): HeadersInit {
  const origin = req.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };
}

function jsonResponse(data: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

function checkAuth(req: Request): boolean {
  if (process.env["NODE_ENV"] === "development") return true;
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === BRIDGE_AUTH_TOKEN;
}

console.log(`⚡ Nerve Local Agent Bridge Daemon starting on http://${BRIDGE_HOST}:${BRIDGE_PORT}`);
console.log(`🔑 Auth Token: ${BRIDGE_AUTH_TOKEN}`);

// Start server
(globalThis as any).Bun?.serve({
  port: BRIDGE_PORT,
  hostname: BRIDGE_HOST,

  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(req),
      });
    }

    const url = new URL(req.url);

    // 1. Health & Status
    if (url.pathname === "/status" || url.pathname === "/health") {
      const adapters = await detectAdapters();
      return jsonResponse(
        {
          status: "connected",
          version: "1.0.0",
          port: BRIDGE_PORT,
          host: BRIDGE_HOST,
          adapters,
          time: new Date().toISOString(),
        },
        200,
        req
      );
    }

    // Auth gate for execution endpoints
    if (!checkAuth(req)) {
      return jsonResponse({ error: "Unauthorized local bridge request" }, 401, req);
    }

    // 2. Direct CLI Adapter Execution
    if (url.pathname === "/exec/job" && req.method === "POST") {
      let body: any;
      try {
        body = await req.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400, req);
      }

      const { adapter, jobType, prompt, model } = body as {
        adapter: AdapterId;
        jobType: JobType;
        prompt: string;
        model?: string;
      };

      if (!adapter || !prompt) {
        return jsonResponse({ error: "Missing required adapter or prompt" }, 400, req);
      }

      const detected = await detectAdapters();
      const adapters = buildAdapters(adapterEnv(), detected);
      const spec = adapters[adapter];
      if (!spec) {
        return jsonResponse({ error: `Unknown adapter: ${adapter}` }, 400, req);
      }

      const jobDir = makeJobDir();
      const promptFile = jobPromptFile(jobDir, prompt, jobType);
      const schemaFile = outputSchemaFile(jobDir);
      const chosenModel = model || spec.configuredModel || spec.defaultModel;

      const startTime = Date.now();
      try {
        const timeoutMs = Number(process.env["NERVE_AGENT_TIMEOUT_MS"] ?? 120_000);
        const maxOutputBytes = Number(process.env["NERVE_AGENT_MAX_OUTPUT"] ?? 256 * 1024);

        const argv = spec.argv(prompt, { jobDir, schemaFile, model: chosenModel });
        const execResult = await spawnAdapter(spec.bin, argv, {
          cwd: jobDir,
          timeoutMs,
          maxOutput: maxOutputBytes,
        });

        const latencyMs = Date.now() - startTime;
        if (execResult.timedOut) {
          return jsonResponse(
            {
              error: `Adapter ${adapter} timed out after ${timeoutMs}ms`,
              latencyMs,
            },
            504,
            req
          );
        }

        const parsed = spec.parseStdout(execResult.stdout);
        const validated = validateProposalJson(parsed.proposalJson);

        return jsonResponse(
          {
            ok: true,
            proposal: validated,
            reportedTokens: parsed.reportedTokens,
            latencyMs,
          },
          200,
          req
        );
      } catch (err: any) {
        return jsonResponse({ error: err.message, latencyMs: Date.now() - startTime }, 500, req);
      } finally {
        try {
          rmSync(jobDir, { recursive: true, force: true });
        } catch { /* ignore cleanup error */ }
      }
    }

    // 3. Stdio MCP tool execution proxy
    if (url.pathname === "/mcp/call" && req.method === "POST") {
      try {
        const body = (await req.json()) as { command: string; args: string[]; input: string };
        const proc = (globalThis as any).Bun?.spawn([body.command, ...(body.args || [])], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });

        if (body.input && proc.stdin) {
          proc.stdin.write(body.input);
          proc.stdin.end();
        }

        const stdout = await new Response(proc.stdout).text();
        const stderr = await new Response(proc.stderr).text();
        const exitCode = await proc.exited;

        return jsonResponse({ exitCode, stdout, stderr }, 200, req);
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500, req);
      }
    }

    return jsonResponse({ error: "Endpoint not found" }, 404, req);
  },
});
