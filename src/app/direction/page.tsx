"use client";

import { useEffect, useState } from "react";
import { Compass, Target, Plus, Sparkles, History, Edit, Save, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { Vision, Outcome } from "@/lib/types";

export default function DirectionPage() {
  const [vision, setVision] = useState<Vision | null>(null);
  const [visionText, setVisionText] = useState("");
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [savingVision, setSavingVision] = useState(false);
  const [visionSaved, setVisionSaved] = useState(false);

  // Outcome modal
  const [createOutcomeOpen, setCreateOutcomeOpen] = useState(false);
  const [outcomeTitle, setOutcomeTitle] = useState("");
  const [outcomeDesc, setOutcomeDesc] = useState("");
  const [outcomeConfidence, setOutcomeConfidence] = useState<"low" | "medium" | "high">("medium");
  const [outcomeDate, setOutcomeDate] = useState("");

  const loadData = async () => {
    try {
      const vRes = await fetch("/api/vision");
      if (vRes.ok) {
        const v = await vRes.json();
        setVision(v);
        setVisionText(v.text || "");
      }
      const oRes = await fetch("/api/outcomes");
      if (oRes.ok) {
        const o = await oRes.json();
        setOutcomes(o);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveVision = async () => {
    setSavingVision(true);
    try {
      const res = await fetch("/api/vision", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: visionText }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVision(updated);
        setVisionSaved(true);
        setTimeout(() => setVisionSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingVision(false);
    }
  };

  const handleCreateOutcome = async () => {
    if (!outcomeTitle.trim()) return;
    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: outcomeTitle.trim(),
          description: outcomeDesc.trim(),
          confidence: outcomeConfidence,
          target_date: outcomeDate || null,
        }),
      });
      if (res.ok) {
        setCreateOutcomeOpen(false);
        setOutcomeTitle("");
        setOutcomeDesc("");
        setOutcomeDate("");
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
            <Compass className="w-5 h-5 text-blue-500" />
            Direction & Strategic Outcomes
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            North star vision statement paired with auditable, high-confidence strategic outcomes.
          </p>
        </div>

        <Button size="sm" onClick={() => setCreateOutcomeOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> New Outcome
        </Button>
      </div>

      {/* Vision Statement Section */}
      <Card>
        <CardHeader className="py-3 px-4 border-b border-neutral-800/80 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-300">
              Founder Vision Statement (Revision {vision?.revision ?? 1})
            </CardTitle>
            <CardDescription className="text-[11px] text-neutral-500">
              Updated {formatDate(vision?.updated_at)}
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleSaveVision}
            disabled={savingVision}
            className={visionSaved ? "bg-emerald-600 hover:bg-emerald-600" : ""}
          >
            {visionSaved ? <Check className="w-3.5 h-3.5 mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            {visionSaved ? "Saved!" : savingVision ? "Saving..." : "Save Vision"}
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <Textarea
            rows={5}
            value={visionText}
            onChange={(e) => setVisionText(e.target.value)}
            placeholder="Define the core thesis, customer profile, and non-negotiable vision..."
            className="text-sm font-sans bg-[#121520] border-neutral-800 leading-relaxed"
          />
        </CardContent>
      </Card>

      {/* Strategic Outcomes List */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-400 font-mono">
          Strategic Outcomes ({outcomes.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {outcomes.length === 0 ? (
            <Card className="col-span-2 p-8 text-center border-dashed">
              <p className="text-xs text-neutral-500">No strategic outcomes established yet.</p>
            </Card>
          ) : (
            outcomes.map((o) => (
              <Card key={o.id} className="hover:border-neutral-700 transition-colors">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-bold text-neutral-100">{o.title}</CardTitle>
                    <Badge
                      variant={
                        o.confidence === "high"
                          ? "success"
                          : o.confidence === "medium"
                          ? "warning"
                          : "destructive"
                      }
                      className="text-[9px] uppercase font-mono"
                    >
                      {o.confidence} conf
                    </Badge>
                  </div>
                  {o.target_date && (
                    <CardDescription className="text-[11px] font-mono text-neutral-400">
                      Target: {o.target_date}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <p className="text-xs text-neutral-300 leading-relaxed">{o.description}</p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Create Outcome Modal */}
      <Dialog open={createOutcomeOpen} onOpenChange={setCreateOutcomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Establish Strategic Outcome</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Outcome Title</label>
              <Input
                placeholder="e.g. 10 paid enterprise pilot customers"
                value={outcomeTitle}
                onChange={(e) => setOutcomeTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Description & Success Metric</label>
              <Textarea
                rows={3}
                placeholder="Define verifiable criteria..."
                value={outcomeDesc}
                onChange={(e) => setOutcomeDesc(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Confidence</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={outcomeConfidence}
                  onChange={(e) => setOutcomeConfidence(e.target.value as any)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Target Date</label>
                <Input
                  type="date"
                  value={outcomeDate}
                  onChange={(e) => setOutcomeDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOutcomeOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOutcome}>Establish Outcome</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
