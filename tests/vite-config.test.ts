import { expect, test } from "bun:test";
import { API_PROXY_PREFIX } from "../vite.config.ts";

test("dev API proxy does not intercept the frontend api.ts module", () => {
  expect("/api/vision".startsWith(API_PROXY_PREFIX)).toBe(true);
  expect("/api.ts".startsWith(API_PROXY_PREFIX)).toBe(false);
});
