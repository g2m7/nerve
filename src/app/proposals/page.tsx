"use client";

import { useEffect, useState } from "react";
import { GitPullRequest, Check, X, AlertCircle, FileDiff, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { Proposal, Decision } from "@/lib/types";

export default function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const pRes = await fetch(`/api/proposals${filter === "pending" ? "?status=pending" : ""}`);
      if (pRes.ok) setProposals(await pRes.json());
      const dRes = await fetch("/api/decisions");
      if (dRes.ok) setDecisions(await dRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [filter]);

  const handleAccept = async (id: string) => {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/proposals/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Accepted via founder review" }),
      });
      if (res.ok) loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt("Reason for rejection (optional):") || "Rejected by founder";
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/proposals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (res.ok) loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <GitPullRequest className="w-5 h-5 text-blue-500" />
            Proposal Review & Approvals
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Agents propose, founders decide. Transactionally apply structured state updates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={filter === "pending" ? "default" : "outline"}
            onClick={() => setFilter("pending")}
          >
            Pending Review
          </Button>
          <Button
            size="sm"
            variant={filter === "all" ? "default" : "outline"}
            onClick={() => setFilter("all")}
          >
            All History
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {proposals.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <p className="text-xs text-neutral-500">
              No {filter === "pending" ? "pending" : ""} proposals waiting. Run an agent job to generate recommendations.
            </p>
          </Card>
        ) : (
          proposals.map((p) => {
            const isPending = p.status === "pending";
            return (
              <Card key={p.id} className="border-neutral-800 space-y-3">
                <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between border-b border-neutral-800/60">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          p.status === "accepted"
                            ? "success"
                            : p.status === "rejected"
                            ? "destructive"
                            : "warning"
                        }
                        className="text-[9px] uppercase font-mono"
                      >
                        {p.status}
                      </Badge>
                      <CardTitle className="text-sm font-bold text-neutral-100 font-mono">
                        Job: {p.job_type}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-[10px] font-mono text-neutral-500 mt-1">
                      ID: {p.id.slice(0, 8)}... • Created {formatDate(p.created_at)} • Adapter: {p.adapter || "unknown"}
                      {p.cache_hit && " • [Exact Cache Hit]"}
                    </CardDescription>
                  </div>

                  {isPending && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(p.id)}
                        disabled={actionInProgress === p.id}
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleAccept(p.id)}
                        disabled={actionInProgress === p.id}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        Accept Transactionally
                      </Button>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-4 pt-2 space-y-4 text-xs">
                  {/* Rationale */}
                  <div className="p-3 rounded-md bg-[#121520] border border-neutral-800">
                    <span className="font-semibold text-neutral-400 text-[10px] uppercase block mb-1">
                      Agent Rationale
                    </span>
                    <p className="text-neutral-200 leading-relaxed font-sans">{p.rationale}</p>
                  </div>

                  {/* Proposed Operations Diff */}
                  <div className="space-y-2">
                    <span className="font-semibold text-neutral-400 text-[10px] uppercase block">
                      Proposed Changes ({p.changes?.length ?? 0} operations)
                    </span>
                    <div className="space-y-2">
                      {p.changes?.map((ch, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded border border-neutral-800 bg-[#0d0f17] font-mono text-xs space-y-1"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[9px] uppercase">
                              {ch.op}
                            </Badge>
                            <span className="text-blue-400 font-bold">{ch.entity}</span>
                            {ch.id && <span className="text-neutral-500 text-[10px]">({ch.id.slice(0, 8)}...)</span>}
                            {ch.expectedRevision !== undefined && (
                              <span className="text-neutral-500 text-[10px]">
                                rev guard: {ch.expectedRevision}
                              </span>
                            )}
                          </div>
                          <pre className="text-[11px] text-neutral-300 overflow-x-auto p-2 bg-[#090b10] rounded mt-2">
                            {JSON.stringify(ch.fields, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
