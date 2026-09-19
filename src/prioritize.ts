import type { Task } from "./types.ts";

// Deterministic Now ordering. Understandable rule, no ML/heuristics:
// 1. overdue open work first (deadline < today), sorted by deadline then priority
// 2. due today / upcoming with deadline, sorted by deadline then priority
// 3. no-deadline work sorted by priority then updated recency
// Blocked tasks are demoted to their own section but keep internal order.
// Done/dropped are excluded from Now.

const PRI_ORDER: Record<Task["priority"], number> = { p0: 0, p1: 1, p2: 2, p3: 3 };

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cmpByDeadlineThenPriority(a: Task, b: Task): number {
  const d = (a.deadline ?? "").localeCompare(b.deadline ?? "");
  if (d !== 0) return d;
  const p = PRI_ORDER[a.priority] - PRI_ORDER[b.priority];
  if (p !== 0) return p;
  return a.updated_at.localeCompare(b.updated_at);
}

export interface NowView {
  overdue: Task[];
  dueNext: Task[];
  unblockedQueue: Task[];
  blocked: Task[];
  ordered: Task[]; // flattened priority order shown as "Top priorities"
}

export function computeNow(tasks: Task[], today = todayKey()): NowView {
  const open = tasks.filter((t) => t.status === "open" || t.status === "doing");
  const isOverdue = (t: Task) => !t.blocked && t.deadline !== null && t.deadline < today;
  const hasDeadline = (t: Task) => t.deadline !== null;

  const overdue = open.filter(isOverdue).sort(cmpByDeadlineThenPriority);
  const blocked = open.filter((t) => t.blocked === 1).sort(cmpByDeadlineThenPriority);
  const rest = open.filter((t) => !isOverdue(t) && t.blocked !== 1);
  const dueNext = rest.filter(hasDeadline).sort(cmpByDeadlineThenPriority);
  const noDate = rest
    .filter((t) => !hasDeadline(t))
    .sort((a, b) => PRI_ORDER[a.priority] - PRI_ORDER[b.priority] || a.updated_at.localeCompare(b.updated_at));

  const ordered = [...overdue, ...dueNext, ...noDate];
  return { overdue, dueNext, unblockedQueue: [...overdue, ...dueNext, ...noDate], blocked, ordered };
}
