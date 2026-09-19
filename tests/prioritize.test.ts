import { describe, expect, test } from "bun:test";
import { computeNow } from "../src/prioritize.ts";
import type { Task } from "../src/types.ts";

function t(partial: Partial<Task> & { id: string; title: string }): Task {
  return {
    status: "open", priority: "p2", deadline: null, outcome_id: null, bet_id: null,
    blocked: 0, revision: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  } as Task;
}

describe("computeNow", () => {
  test("overdue first, then deadline order, then priority; blocked apart; done excluded", () => {
    const tasks = [
      t({ id: "done1", title: "done", status: "done", deadline: "2026-01-01", priority: "p0" }),
      t({ id: "late", title: "late", deadline: "2026-09-01", priority: "p2" }),
      t({ id: "sooner", title: "sooner", deadline: "2026-09-20", priority: "p3" }),
      t({ id: "later", title: "later", deadline: "2026-09-25", priority: "p0" }),
      t({ id: "nodate-p0", title: "nodate p0", priority: "p0" }),
      t({ id: "nodate-p3", title: "nodate p3", priority: "p3" }),
      t({ id: "blocked1", title: "blocked", deadline: "2026-09-01", blocked: 1, priority: "p0" }),
    ];
    const v = computeNow(tasks, "2026-09-19");
    expect(v.ordered.map((x) => x.id)).toEqual(["late", "sooner", "later", "nodate-p0", "nodate-p3"]);
    expect(v.overdue.map((x) => x.id)).toEqual(["late"]);
    expect(v.blocked.map((x) => x.id)).toEqual(["blocked1"]);
  });
});
