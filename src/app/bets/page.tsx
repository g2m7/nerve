"use client";

import { useEffect, useState } from "react";
import { Target, Plus, Sparkles, AlertCircle, CheckCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { Bet, Outcome } from "@/lib/types";

export default function BetsPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [assumption, setAssumption] = useState("");
  const [rationale, setRationale] = useState("");
  const [outcomeId, setOutcomeId] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [confidence, setConfidence] = useState<"low" | "medium" | "high">("medium");

  const loadData = async () => {
    try {
      const bRes = await fetch("/api/bets");
      if (bRes.ok) setBets(await bRes.json());
      const oRes = await fetch("/api/outcomes");
      if (oRes.ok) setOutcomes(await oRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          assumption: assumption.trim(),
          rationale: rationale.trim(),
          outcome_id: outcomeId || null,
          review_date: reviewDate || null,
          confidence,
        }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setTitle("");
        setAssumption("");
        setRationale("");
        setOutcomeId("");
        setReviewDate("");
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-amber-500" />
            Strategic Bets & Hypotheses
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Falsifiable assumptions, explicit review dates, and stress-tested founder conviction.
          </p>
        </div>

        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Place Bet
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {bets.length === 0 ? (
          <Card className="col-span-2 p-12 text-center border-dashed">
            <p className="text-xs text-neutral-500">No active bets placed yet.</p>
          </Card>
        ) : (
          bets.map((bet) => (
            <Card key={bet.id} className="space-y-3">
              <CardHeader className="p-4 pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-bold text-neutral-100">{bet.title}</CardTitle>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono">
                    {bet.status}
                  </Badge>
                </div>
                {bet.review_date && (
                  <CardDescription className="text-[11px] font-mono text-amber-400">
                    Review Date: {bet.review_date}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-2 text-xs">
                {bet.assumption && (
                  <div className="p-2.5 rounded bg-[#131622] border border-neutral-800">
                    <span className="font-semibold text-neutral-400 text-[10px] uppercase block mb-1">
                      Underlying Assumption
                    </span>
                    <p className="text-neutral-300 leading-relaxed">{bet.assumption}</p>
                  </div>
                )}
                {bet.rationale && (
                  <div>
                    <span className="font-semibold text-neutral-400 text-[10px] uppercase block mb-1">
                      Rationale
                    </span>
                    <p className="text-neutral-400 leading-relaxed">{bet.rationale}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place Strategic Bet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Bet Title</label>
              <Input
                placeholder="e.g. Self-serve onboarding converts at > 15%"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Key Assumption</label>
              <Textarea
                rows={2}
                placeholder="What must be true for this to work?"
                value={assumption}
                onChange={(e) => setAssumption(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Rationale</label>
              <Textarea
                rows={2}
                placeholder="Why do we believe this today?"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Linked Outcome</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={outcomeId}
                  onChange={(e) => setOutcomeId(e.target.value)}
                >
                  <option value="">None</option>
                  {outcomes.map((o) => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Review Date</label>
                <Input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Place Bet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
