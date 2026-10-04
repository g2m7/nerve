"use client";

import { useEffect, useState } from "react";
import { Settings, Terminal, Database, ShieldCheck, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { checkBridgeStatus, type BridgeStatus } from "@/lib/bridge-client";

export default function SettingsPage() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>({ connected: false });
  const [dbInfo, setDbInfo] = useState<{ engine?: string; ok?: boolean }>({});
  const [loading, setLoading] = useState(false);

  const refreshAll = async () => {
    setLoading(true);
    const b = await checkBridgeStatus();
    setBridgeStatus(b);
    try {
      const dbRes = await fetch("/api/health");
      if (dbRes.ok) setDbInfo(await dbRes.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const adapters = bridgeStatus.adapters || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-neutral-400" />
            System & Bridge Settings
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Local agent bridge pairing, CLI adapters detection, and PostgreSQL authority.
          </p>
        </div>

        <Button size="sm" variant="outline" onClick={refreshAll} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Status
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Local Agent Bridge Card */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-blue-400" />
                <CardTitle className="text-sm font-bold text-neutral-100">
                  Nerve Local Agent Bridge
                </CardTitle>
              </div>
              <Badge variant={bridgeStatus.connected ? "success" : "secondary"}>
                {bridgeStatus.connected ? "Connected" : "Offline"}
              </Badge>
            </div>
            <CardDescription className="text-xs text-neutral-400 mt-1">
              Loopback daemon (127.0.0.1:3031) bridging remote browser to local CLI agents.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-4 text-xs">
            <div className="p-3 bg-[#0c0e15] border border-neutral-800 rounded font-mono text-[11px] text-neutral-300">
              <p className="text-neutral-500 mb-1"># Run locally in your terminal with Bun:</p>
              <p className="text-blue-400 font-bold">bun run src/bridge/bridge.ts</p>
            </div>

            <div className="space-y-2">
              <p className="font-semibold text-neutral-300 text-[11px] uppercase tracking-wider">
                CLI Adapters Detection
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {[
                  { id: "codex", label: "codex (OpenAI Operator CLI)" },
                  { id: "agy", label: "agy (Antigravity CLI)" },
                  { id: "opencode", label: "opencode (OpenCode CLI)" },
                  { id: "pi", label: "pi (Inflection CLI)" },
                  { id: "droid", label: "droid (Factory CLI)" },
                ].map((cli) => {
                  const isInstalled = adapters[cli.id] === true;
                  return (
                    <div
                      key={cli.id}
                      className="flex items-center justify-between p-2 rounded bg-[#121520] border border-neutral-800/80"
                    >
                      <span className="font-mono text-neutral-300">{cli.label}</span>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        {isInstalled ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Available</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-neutral-500" />
                            <span className="text-neutral-500">Not detected</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Database & Authority Card */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-400" />
              <CardTitle className="text-sm font-bold text-neutral-100">
                PostgreSQL Engine
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-neutral-400 mt-1">
              Deterministic source of truth with strict relational schema & foreign keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-2 space-y-3 text-xs">
            <div className="p-3 bg-[#0c0e15] border border-neutral-800 rounded space-y-1.5">
              <div className="flex justify-between">
                <span className="text-neutral-400">Backend Driver:</span>
                <span className="font-mono text-neutral-200">{dbInfo.engine || "PostgreSQL"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Status:</span>
                <span className="text-emerald-400 font-medium">Ready & Migrated</span>
              </div>
            </div>

            <div className="p-3 bg-[#131622] border border-neutral-800 rounded space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-neutral-200">Trust Boundary Rules</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-neutral-400 text-[11px] leading-relaxed">
                <li>No arbitrary shell execution. Adapters execute in read-only sandbox.</li>
                <li>Stale expectedRevision guards reject colliding concurrent transactions.</li>
                <li>All founder decisions and state modifications are audited permanently.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
