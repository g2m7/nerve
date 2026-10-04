"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  ListTodo,
  Sparkles,
  Play,
  Plus,
  ArrowRight,
  Flame,
  Check,
  Ban,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import type { Task, NowView } from "@/lib/types";
import Link from "next/link";
import { runJobViaBridge } from "@/lib/bridge-client";

export default function FocusPage() {
  const [nowData, setNowData] = useState<NowView | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [runningJob, setRunningJob] = useState(false);
  const [jobFeedback, setJobFeedback] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch("/api/now");
      if (res.ok) {
        const data = await res.json();
        setNowData(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleQuickAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTitle.trim()) return;
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickTitle.trim(),
          priority: "p1",
          status: "open",
        }),
      });
      if (res.ok) {
        setQuickTitle("");
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleDone = async (task: Task) => {
    const nextStatus = task.status === "done" ? "open" : "done";
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          expectedRevision: task.revision,
        }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleBlock = async (task: Task) => {
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked: task.blocked === 1 ? 0 : 1,
          expectedRevision: task.revision,
        }),
      });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const triggerReplanJob = async () => {
    setRunningJob(true);
    setJobFeedback("Compiling deterministic context & checking cache...");
    try {
      const compileRes = await fetch("/api/jobs/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adapter: "codex",
          jobType: "replan-work",
          refs: {},
        }),
      });
      const comp = await compileRes.json();

      if (comp.cacheHit) {
        setJobFeedback(`Cache Hit! Proposal generated in 5ms (#${comp.proposalId.slice(0, 8)})`);
        setRunningJob(false);
        return;
      }

      setJobFeedback("Dispatching to Local Agent Bridge (:3031)...");
      const bridgeRes = await runJobViaBridge({
        adapter: "codex",
        jobType: "replan-work",
        prompt: comp.prompt,
      });

      if (!bridgeRes.ok) {
        setJobFeedback(`Bridge Notice: ${bridgeRes.error || "Bridge offline"}`);
        setRunningJob(false);
        return;
      }

      setJobFeedback("Ingesting proposal into PostgreSQL database...");
      const completeRes = await fetch("/api/jobs/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cacheKey: comp.cacheKey,
          adapter: "codex",
          jobType: "replan-work",
          proposal: bridgeRes.proposal,
          reportedTokens: bridgeRes.reportedTokens,
          tokenEstimate: comp.tokenEstimate,
          digest: comp.digest,
        }),
      });
      const compData = await completeRes.json();
      setJobFeedback(`Success! Pending proposal created (#${compData.proposalId?.slice(0, 8)}).`);
    } catch (err: any) {
      setJobFeedback(`Error: ${err.message}`);
    } finally {
      setRunningJob(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Welcome / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Flame className="w-6 h-6 text-amber-500" />
            Focus Command Center
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Deterministic prioritization. Overdue and high-leverage execution first.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            onClick={triggerReplanJob}
            disabled={runningJob}
            className="border-neutral-700 bg-neutral-900"
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-blue-400" />
            {runningJob ? "Running Job..." : "Replan Work (Job)"}
          </Button>

          <Link href="/proposals">
            <Button size="sm" variant="default">
              Review Proposals
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
            </Button>
          </Link>
        </div>
      </div>

      {jobFeedback && (
        <div className="p-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-xs font-mono text-blue-300 flex items-center justify-between">
          <span>{jobFeedback}</span>
          <button onClick={() => setJobFeedback(null)} className="text-neutral-400 hover:text-white">
            ×
          </button>
        </div>
      )}

      {/* Quick Add Bar */}
      <form onSubmit={handleQuickAdd} className="flex gap-2">
        <Input
          placeholder="Type a high-priority task and press Enter..."
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          className="bg-[#121520] border-neutral-800 text-sm h-10"
        />
        <Button type="submit" size="default">
          <Plus className="w-4 h-4 mr-1" /> Add Task
        </Button>
      </form>

      {/* Grid: Overdue Tasks + Due Next + Blocked */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Overdue */}
        <Card className="border-red-900/40 bg-[#120f12]">
          <CardHeader className="py-3 px-4 border-b border-red-900/30 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-red-400">
                Overdue Work
              </CardTitle>
            </div>
            <Badge variant="destructive" className="font-mono">
              {nowData?.overdue.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent className="p-3 divide-y divide-red-950/40 max-h-80 overflow-y-auto">
            {nowData?.overdue.length === 0 ? (
              <p className="p-4 text-center text-xs text-neutral-500">No overdue tasks. Clean slate!</p>
            ) : (
              nowData?.overdue.map((t) => (
                <div key={t.id} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-200 font-medium">{t.title}</p>
                    <p className="text-[10px] font-mono text-red-400">Due {t.deadline}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-neutral-400 hover:text-emerald-400"
                      onClick={() => handleToggleDone(t)}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Due Next / Upcoming */}
        <Card>
          <CardHeader className="py-3 px-4 border-b border-neutral-800/80 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-amber-400">
                Due Next
              </CardTitle>
            </div>
            <Badge variant="warning" className="font-mono">
              {nowData?.dueNext.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent className="p-3 divide-y divide-neutral-800/40 max-h-80 overflow-y-auto">
            {nowData?.dueNext.length === 0 ? (
              <p className="p-4 text-center text-xs text-neutral-500">No scheduled upcoming tasks.</p>
            ) : (
              nowData?.dueNext.map((t) => (
                <div key={t.id} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-200 font-medium">{t.title}</p>
                    <p className="text-[10px] font-mono text-amber-400">Due {t.deadline}</p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-neutral-400 hover:text-emerald-400"
                    onClick={() => handleToggleDone(t)}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Blocked Work */}
        <Card className="border-neutral-800">
          <CardHeader className="py-3 px-4 border-b border-neutral-800/80 flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-neutral-400" />
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-400">
                Blocked Items
              </CardTitle>
            </div>
            <Badge variant="secondary" className="font-mono">
              {nowData?.blocked.length ?? 0}
            </Badge>
          </CardHeader>
          <CardContent className="p-3 divide-y divide-neutral-800/40 max-h-80 overflow-y-auto">
            {nowData?.blocked.length === 0 ? (
              <p className="p-4 text-center text-xs text-neutral-500">No blocked tasks.</p>
            ) : (
              nowData?.blocked.map((t) => (
                <div key={t.id} className="py-2.5 flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-xs text-neutral-400 line-through">{t.title}</p>
                    <Badge variant="outline" className="text-[9px]">Blocked</Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] text-blue-400"
                    onClick={() => handleToggleBlock(t)}
                  >
                    Unblock
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Flattened Priority Backlog */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-neutral-800/80 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="w-4 h-4 text-blue-400" />
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-300">
              Deterministic Priority Order (Active Now Queue)
            </CardTitle>
          </div>
          <span className="text-xs font-mono text-neutral-500">
            {nowData?.ordered.length ?? 0} active items
          </span>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-800/40">
          {nowData?.ordered.length === 0 ? (
            <p className="p-8 text-center text-xs text-neutral-500">No active tasks in queue.</p>
          ) : (
            nowData?.ordered.map((t, idx) => (
              <div
                key={t.id}
                className="p-3.5 flex items-center justify-between hover:bg-neutral-800/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-neutral-600 w-6">#{idx + 1}</span>
                  <button
                    onClick={() => handleToggleDone(t)}
                    className="w-4 h-4 rounded border border-neutral-700 flex items-center justify-center hover:border-emerald-500 text-transparent hover:text-emerald-500"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <span className="text-xs text-neutral-200 font-medium">{t.title}</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <Badge
                    variant={
                      t.priority === "p0"
                        ? "destructive"
                        : t.priority === "p1"
                        ? "warning"
                        : "secondary"
                    }
                    className="uppercase font-mono text-[10px]"
                  >
                    {t.priority}
                  </Badge>
                  {t.deadline && (
                    <span className="text-[11px] font-mono text-neutral-400">
                      {t.deadline}
                    </span>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-neutral-500 hover:text-neutral-300"
                    onClick={() => handleToggleBlock(t)}
                    title={t.blocked === 1 ? "Unblock task" : "Mark as blocked"}
                  >
                    <Ban className={`w-3.5 h-3.5 ${t.blocked === 1 ? "text-red-400" : ""}`} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
