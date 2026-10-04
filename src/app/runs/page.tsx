"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu, CheckCircle2, AlertOctagon, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { AgentRun } from "@/lib/types";

export default function RunsPage() {
  const [runs, setRuns] = useState<AgentRun[]>([]);

  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then(setRuns)
      .catch(console.error);
  }, []);

  const totalTokens = runs.reduce((acc, r) => acc + (r.reported_tokens || r.est_tokens || 0), 0);
  const cacheHits = runs.filter((r) => r.status === "cache_hit").length;
  const hitRate = runs.length > 0 ? Math.round((cacheHits / runs.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-500" />
            Agent Runs & Deterministic Cache Telemetry
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Auditable execution logs, exact SHA-256 hash hit rates, and zero semantic drift.
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-[10px] uppercase font-mono tracking-wider text-neutral-500">Total Invocations</p>
          <p className="text-2xl font-bold text-neutral-100 mt-1 font-mono">{runs.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase font-mono tracking-wider text-neutral-500">Cache Hit Rate</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1 font-mono">{hitRate}%</p>
          <p className="text-[10px] text-neutral-400 mt-0.5">{cacheHits} instant hash matches</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase font-mono tracking-wider text-neutral-500">Estimated Tokens</p>
          <p className="text-2xl font-bold text-blue-400 mt-1 font-mono">{totalTokens.toLocaleString()}</p>
        </Card>
      </div>

      {/* Runs Table */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-neutral-800/80">
          <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-300">
            Execution Log ({runs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-neutral-800/40">
          {runs.length === 0 ? (
            <p className="p-12 text-center text-xs text-neutral-500">No agent runs recorded yet.</p>
          ) : (
            runs.map((run) => (
              <div key={run.id} className="p-3.5 flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        run.status === "ok"
                          ? "success"
                          : run.status === "cache_hit"
                          ? "default"
                          : "destructive"
                      }
                      className="text-[9px] uppercase font-mono"
                    >
                      {run.status}
                    </Badge>
                    <span className="font-bold text-neutral-200">{run.job_type}</span>
                    <span className="font-mono text-neutral-500 text-[10px]">
                      via {run.adapter}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-neutral-500">
                    Cache Key: {run.cache_key?.slice(0, 16)}... • Started: {formatDate(run.started_at)}
                  </p>
                </div>

                <div className="text-right font-mono text-[11px] text-neutral-400">
                  <span>~{run.reported_tokens || run.est_tokens} tokens</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
