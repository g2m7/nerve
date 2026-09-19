import { describe, expect, test } from "bun:test";
import { guardApiRequest, normalizedHost } from "../src/http-security.ts";

describe("local API request guard", () => {
  test("blocks non-loopback Host on reads and writes", () => {
    const read = new Request("http://127.0.0.1/api/vision", { headers: { host: "evil.example" } });
    expect(guardApiRequest(read)).toEqual({ status: 403, error: "forbidden host" });

    const write = new Request("http://127.0.0.1/api/outcomes", {
      method: "POST",
      headers: { host: "evil.example", "content-type": "application/json" },
      body: "{}",
    });
    expect(guardApiRequest(write)).toEqual({ status: 403, error: "forbidden host" });
  });

  test("requires loopback origin and JSON for writes", () => {
    const badOrigin = new Request("http://127.0.0.1/api/outcomes", {
      method: "DELETE",
      headers: { host: "127.0.0.1:3030", origin: "https://evil.example", "content-type": "application/json" },
    });
    expect(guardApiRequest(badOrigin)).toEqual({ status: 403, error: "forbidden origin" });

    const noJson = new Request("http://127.0.0.1/api/outcomes", {
      method: "DELETE",
      headers: { host: "127.0.0.1:3030" },
    });
    expect(guardApiRequest(noJson)).toEqual({ status: 400, error: "content-type must be application/json" });

    const allowed = new Request("http://127.0.0.1/api/outcomes", {
      method: "DELETE",
      headers: { host: "127.0.0.1:3030", origin: "http://localhost:5173", "content-type": "application/json" },
    });
    expect(guardApiRequest(allowed)).toBeNull();
  });

  test("accepts IPv4, localhost, and bracketed IPv6 loopback", () => {
    expect(normalizedHost("127.0.0.1:3030")).toBe("127.0.0.1");
    expect(normalizedHost("localhost:3030")).toBe("localhost");
    expect(normalizedHost("[::1]:3030")).toBe("::1");
  });
});
