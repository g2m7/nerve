const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

export function normalizedHost(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  try {
    const hostname = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`).hostname;
    return hostname.replace(/^\[|\]$/g, "");
  } catch {
    return "invalid";
  }
}

export function isLoopbackHost(value: string | null): boolean {
  const host = normalizedHost(value);
  return host === null || LOOPBACK.has(host);
}

export interface RequestGuardFailure {
  status: 400 | 403;
  error: string;
}

export function guardApiRequest(req: Request): RequestGuardFailure | null {
  const url = new URL(req.url);
  if (!url.pathname.startsWith("/api/")) return null;

  // Validate Host for reads and writes. This blocks DNS rebinding from exposing
  // founder data through a non-loopback origin.
  if (!isLoopbackHost(req.headers.get("host"))) return { status: 403, error: "forbidden host" };

  const method = req.method.toUpperCase();
  const isWrite = method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
  if (!isWrite) return null;

  if (!isLoopbackHost(req.headers.get("origin"))) return { status: 403, error: "forbidden origin" };

  // JSON makes browser writes non-simple requests and rejects text/plain CSRF.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { status: 400, error: "content-type must be application/json" };
  }
  return null;
}
