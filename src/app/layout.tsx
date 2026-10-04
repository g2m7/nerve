import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import {
  Compass,
  Target,
  CheckSquare,
  Radio,
  FolderTree,
  GitPullRequest,
  Activity,
  Cpu,
  Settings,
  Layers,
} from "lucide-react";
import BridgeStatusBadge from "@/components/BridgeStatusBadge";

export const metadata: Metadata = {
  title: "Nerve — Solo-Founder Vision-to-Execution OS",
  description: "Deterministic strategy and task execution with local agent bridge and context vault",
};

const NAV_ITEMS = [
  { href: "/", label: "Focus", icon: Layers, index: "01" },
  { href: "/direction", label: "Direction", icon: Compass, index: "02" },
  { href: "/bets", label: "Bets", icon: Target, index: "03" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, index: "04" },
  { href: "/signals", label: "Signals", icon: Radio, index: "05" },
  { href: "/vault", label: "Vault (Files)", icon: FolderTree, index: "06" },
  { href: "/proposals", label: "Proposals", icon: GitPullRequest, index: "07" },
  { href: "/runs", label: "Runs & Telemetry", icon: Activity, index: "08" },
  { href: "/mcp", label: "MCP Tools", icon: Cpu, index: "09" },
  { href: "/settings", label: "Settings", icon: Settings, index: "10" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090a0f] text-neutral-100 flex min-h-screen">
        {/* Navigation Sidebar */}
        <aside className="w-64 border-r border-neutral-800/80 bg-[#0c0e14] flex flex-col shrink-0 select-none">
          {/* Brand */}
          <div className="p-5 border-b border-neutral-800/70 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-500 transition-colors">
                N
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wide text-white">NERVE</h1>
                <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Founder OS</p>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:bg-[#141724] transition-colors group"
                >
                  <Icon className="w-4 h-4 text-neutral-500 group-hover:text-blue-400 transition-colors" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-[10px] text-neutral-600 font-mono">{item.index}</span>
                </Link>
              );
            })}
          </nav>

          {/* Local Agent Bridge Status Pill */}
          <div className="p-4 border-t border-neutral-800/70 bg-[#0a0b10]">
            <BridgeStatusBadge />
            <div className="mt-3 text-[10px] text-neutral-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse" />
              <span>Jobs, not personas. Founder-approved.</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#090a0f]">
          <header className="h-14 border-b border-neutral-800/80 px-8 flex items-center justify-between bg-[#0b0d13]/60 backdrop-blur sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-neutral-400 uppercase tracking-widest">Command Center</span>
              <span className="text-neutral-700">/</span>
              <span className="text-xs text-neutral-300">
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date())}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs px-2.5 py-1 rounded bg-neutral-900 border border-neutral-800 text-neutral-400 font-mono">
                PostgreSQL Engine
              </span>
            </div>
          </header>

          <main className="flex-1 p-8 overflow-y-auto max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
