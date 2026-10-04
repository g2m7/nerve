"use client";

import { useEffect, useState } from "react";
import { Cpu, Plus, Trash2, CheckCircle2, Globe, Terminal, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { McpServer, McpTransport } from "@/lib/types";

export default function McpPage() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [isLocal, setIsLocal] = useState(true);
  const [command, setCommand] = useState("");
  const [url, setUrl] = useState("");

  const loadData = async () => {
    try {
      const res = await fetch("/api/mcp/servers");
      if (res.ok) setServers(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const res = await fetch("/api/mcp/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          transport,
          is_local: isLocal,
          command: command || null,
          url: url || null,
        }),
      });
      if (res.ok) {
        setCreateOpen(false);
        setName("");
        setCommand("");
        setUrl("");
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/mcp/servers/${id}`, { method: "DELETE" });
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
            <Cpu className="w-5 h-5 text-blue-400" />
            Model Context Protocol (MCP) Server Registry
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Connect local stdio tool servers via Nerve Bridge or remote SSE/HTTP tool endpoints.
          </p>
        </div>

        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add MCP Server
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {servers.length === 0 ? (
          <Card className="col-span-2 p-12 text-center border-dashed">
            <p className="text-xs text-neutral-500">No MCP servers registered. Add a local or remote tool server.</p>
          </Card>
        ) : (
          servers.map((srv) => (
            <Card key={srv.id} className="space-y-2">
              <CardHeader className="p-4 pb-0 flex flex-row items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px] uppercase font-mono">
                      {srv.transport}
                    </Badge>
                    <CardTitle className="text-sm font-bold text-neutral-100">{srv.name}</CardTitle>
                  </div>
                  <CardDescription className="text-[11px] font-mono text-neutral-400 mt-1">
                    {srv.is_local ? "Local Daemon Bridge (stdio)" : "Cloud Remote (SSE/HTTP)"}
                  </CardDescription>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-neutral-500 hover:text-red-400"
                  onClick={() => handleDelete(srv.id)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </CardHeader>
              <CardContent className="p-4 pt-1">
                {srv.command && (
                  <pre className="text-[11px] font-mono bg-[#11131c] p-2 rounded border border-neutral-800 text-neutral-300 overflow-x-auto">
                    {srv.command}
                  </pre>
                )}
                {srv.url && (
                  <p className="text-xs font-mono text-blue-400 truncate mt-1">
                    {srv.url}
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
            <DialogTitle>Register MCP Server</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Server Name</label>
              <Input
                placeholder="e.g. Postgres DB Explorer or GitHub MCP"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Transport</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value as any)}
                >
                  <option value="stdio">stdio (Local CLI Process)</option>
                  <option value="sse">SSE (Server-Sent Events)</option>
                  <option value="streamable_http">Streamable HTTP</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Execution Host</label>
                <select
                  className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                  value={isLocal ? "local" : "cloud"}
                  onChange={(e) => setIsLocal(e.target.value === "local")}
                >
                  <option value="local">Local Bridge (127.0.0.1:3031)</option>
                  <option value="cloud">Cloud / Next.js Server</option>
                </select>
              </div>
            </div>
            {transport === "stdio" ? (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Executable Command</label>
                <Input
                  placeholder="e.g. bun run ./my-tool.ts"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Endpoint URL</label>
                <Input
                  placeholder="https://mcp-server.mycompany.internal/sse"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Register Server</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
