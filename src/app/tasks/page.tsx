"use client";

import { useEffect, useState } from "react";
import { CheckSquare, Plus, Trash2, Check, Ban, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Task, TaskPriority, TaskStatus } from "@/lib/types";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("p2");
  const [deadline, setDeadline] = useState("");

  const loadTasks = async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) setTasks(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          priority,
          deadline: deadline || null,
        }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setTitle("");
        setDeadline("");
        loadTasks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (task: Task, nextStatus: TaskStatus) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus, expectedRevision: task.revision }),
      });
      loadTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      loadTasks();
    } catch (e) {
      console.error(e);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filterStatus === "all") return true;
    return t.status === filterStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-emerald-500" />
            Task Management Backlog
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Deterministic prioritization and status workflows without heuristic interference.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="bg-[#141722] border border-neutral-800 rounded-md px-3 py-1.5 text-xs text-neutral-300"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">All Statuses ({tasks.length})</option>
            <option value="open">Open</option>
            <option value="doing">Doing</option>
            <option value="done">Done</option>
            <option value="dropped">Dropped</option>
          </select>

          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> New Task
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-neutral-800/40">
          {filteredTasks.length === 0 ? (
            <p className="p-12 text-center text-xs text-neutral-500">No tasks found matching filter.</p>
          ) : (
            filteredTasks.map((task) => (
              <div
                key={task.id}
                className="p-3.5 flex items-center justify-between hover:bg-neutral-800/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => handleStatusChange(task, task.status === "done" ? "open" : "done")}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      task.status === "done"
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "border-neutral-700 hover:border-emerald-500 text-transparent hover:text-emerald-500"
                    }`}
                  >
                    <Check className="w-3 h-3" />
                  </button>

                  <div className="truncate">
                    <p
                      className={`text-xs font-medium ${
                        task.status === "done"
                          ? "line-through text-neutral-500"
                          : "text-neutral-200"
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {task.deadline && (
                        <span className="text-[10px] font-mono text-neutral-400">
                          Due {task.deadline}
                        </span>
                      )}
                      {task.blocked === 1 && (
                        <Badge variant="destructive" className="text-[9px] py-0">Blocked</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Badge
                    variant={
                      task.priority === "p0"
                        ? "destructive"
                        : task.priority === "p1"
                        ? "warning"
                        : "secondary"
                    }
                    className="uppercase font-mono text-[9px]"
                  >
                    {task.priority}
                  </Badge>

                  <select
                    className="bg-[#141722] border border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-300 font-mono"
                    value={task.status}
                    onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                  >
                    <option value="open">open</option>
                    <option value="doing">doing</option>
                    <option value="done">done</option>
                    <option value="dropped">dropped</option>
                  </select>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-neutral-500 hover:text-red-400"
                    onClick={() => handleDelete(task.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Title</label>
              <Input
                placeholder="What needs to get done?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Priority</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                >
                  <option value="p0">P0 (Critical / Blocker)</option>
                  <option value="p1">P1 (High)</option>
                  <option value="p2">P2 (Normal)</option>
                  <option value="p3">P3 (Backlog)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Deadline</label>
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
