// Client-side helper for interacting with the Nerve Local Agent Bridge (127.0.0.1:3031)

export interface BridgeStatus {
  connected: boolean;
  version?: string;
  port?: number;
  host?: string;
  adapters?: Record<string, boolean>;
  time?: string;
  error?: string;
}

export const BRIDGE_URL = "http://127.0.0.1:3031";

export async function checkBridgeStatus(token?: string): Promise<BridgeStatus> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const headers: HeadersInit = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${BRIDGE_URL}/status`, {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { connected: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      connected: true,
      version: data.version,
      port: data.port,
      host: data.host,
      adapters: data.adapters,
      time: data.time,
    };
  } catch (err: any) {
    return {
      connected: false,
      error: err.name === "AbortError" ? "Connection timed out" : "Daemon offline",
    };
  }
}

export async function runJobViaBridge(args: {
  adapter: string;
  jobType: string;
  prompt: string;
  model?: string;
  token?: string;
}): Promise<{ ok: boolean; proposal?: any; reportedTokens?: number | null; error?: string; latencyMs?: number }> {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (args.token) {
      headers["Authorization"] = `Bearer ${args.token}`;
    }

    const res = await fetch(`${BRIDGE_URL}/exec/job`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        adapter: args.adapter,
        jobType: args.jobType,
        prompt: args.prompt,
        model: args.model,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `HTTP ${res.status}`, latencyMs: data.latencyMs };
    }

    return {
      ok: true,
      proposal: data.proposal,
      reportedTokens: data.reportedTokens,
      latencyMs: data.latencyMs,
    };
  } catch (err: any) {
    return { ok: false, error: `Bridge communication failed: ${err.message}` };
  }
}
