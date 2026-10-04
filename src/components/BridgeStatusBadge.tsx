"use client";

import { useEffect, useState } from "react";
import { checkBridgeStatus, type BridgeStatus } from "@/lib/bridge-client";
import { Terminal, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function BridgeStatusBadge() {
  const [status, setStatus] = useState<BridgeStatus>({ connected: false });
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const s = await checkBridgeStatus();
    setStatus(s);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => clearInterval(interval);
  }, []);

  const availableAdapters = status.adapters
    ? Object.entries(status.adapters)
        .filter(([, v]) => v)
        .map(([k]) => k)
    : [];

  return (
    <div className="rounded-lg border border-neutral-800 bg-[#121520] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-xs font-semibold text-neutral-200">Local Bridge</span>
        </div>
        <button
          onClick={refresh}
          title="Refresh connection"
          className="text-neutral-500 hover:text-neutral-300 transition-colors p-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              status.connected ? "bg-emerald-500 shadow-sm shadow-emerald-500/50" : "bg-neutral-600"
            }`}
          />
          <span className={status.connected ? "text-emerald-400 font-medium" : "text-neutral-400"}>
            {status.connected ? "Connected (:3031)" : "Offline (Local)"}
          </span>
        </div>
        <Link href="/settings" className="text-blue-400 hover:underline text-[10px]">
          Config
        </Link>
      </div>

      {status.connected && (
        <div className="mt-2 pt-2 border-t border-neutral-800/80 text-[10px] text-neutral-400">
          CLIs:{" "}
          <span className="text-neutral-300 font-mono">
            {availableAdapters.length > 0 ? availableAdapters.join(", ") : "None detected"}
          </span>
        </div>
      )}
    </div>
  );
}
