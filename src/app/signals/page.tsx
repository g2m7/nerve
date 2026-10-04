"use client";

import { useEffect, useState } from "react";
import { Radio, Plus, Trash2, Quote, BarChart2, Calendar, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { Signal, SignalKind, Bet } from "@/lib/types";

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<SignalKind>("note");
  const [evidence, setEvidence] = useState("");
  const [betId, setBetId] = useState("");

  const loadData = async () => {
    try {
      const sRes = await fetch("/api/signals");
      if (sRes.ok) setSignals(await sRes.json());
      const bRes = await fetch("/api/bets");
      if (bRes.ok) setBets(await bRes.json());
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
      const res = await fetch("/api/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          kind,
          evidence: evidence.trim(),
          bet_id: betId || null,
        }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setTitle("");
        setEvidence("");
        setBetId("");
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/signals/${id}`, { method: "DELETE" });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-400" />
            Signals & Observations
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Empirical customer notes, metrics, quotes, and market events testing strategic bets.
          </p>
        </div>

        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Log Signal
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {signals.length === 0 ? (
          <Card className="col-span-2 p-12 text-center border-dashed">
            <p className="text-xs text-neutral-500">No signals logged yet. Record inbound feedback or data.</p>
          </Card>
        ) : (
          signals.map((sig) => (
            <Card key={sig.id} className="space-y-2">
              <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] uppercase font-mono">
                      {sig.kind}
                    </Badge>
                    <CardTitle className="text-sm font-bold text-neutral-100">{sig.title}</CardTitle>
                  </div>
                  <CardDescription className="text-[10px] font-mono text-neutral-500 mt-1">
                    Observed: {formatDate(sig.occurred_at)}
                  </CardDescription>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-neutral-500 hover:text-red-400"
                  onClick={() => handleDelete(sig.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {sig.evidence && (
                  <p className="text-xs text-neutral-300 bg-[#121520] p-2.5 rounded border border-neutral-800 leading-relaxed font-sans">
                    {sig.evidence}
                  </p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Empirical Signal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Title</label>
              <Input
                placeholder="e.g. Enterprise lead asks for SOC2 compliance"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Signal Kind</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as any)}
                >
                  <option value="note">Note</option>
                  <option value="quote">Quote</option>
                  <option value="metric">Metric</option>
                  <option value="event">Event</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Linked Bet</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={betId}
                  onChange={(e) => setBetId(e.target.value)}
                >
                  <option value="">None</option>
                  {bets.map((b) => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Evidence / Excerpt</label>
              <Textarea
                rows={3}
                placeholder="Direct quotation, metrics snapshot, or conversation notes..."
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Log Signal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
