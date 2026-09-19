export async function api<T>(path: string, opts?: { method?: string; body?: unknown }): Promise<T> {
  const method = opts?.method ?? "GET";
  const init: RequestInit = { method };
  if (method !== "GET" && method !== "HEAD") {
    init.headers = { "content-type": "application/json" };
  }
  if (opts?.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}
