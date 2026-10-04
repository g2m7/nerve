"use client";

import { useEffect, useState } from "react";
import {
  Folder,
  FileText,
  Plus,
  Trash2,
  Edit3,
  Search,
  Save,
  Link as LinkIcon,
  Check,
  ChevronRight,
  FolderPlus,
  FileCode,
  Tag,
  Clock,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { FileNode, FileEntityLink } from "@/lib/types";

export default function VaultPage() {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Editor states
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<"file" | "directory" | "note">("file");
  const [createName, setCreateName] = useState("");
  const [createInitialContent, setCreateInitialContent] = useState("");

  // Entity link modal
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [entityType, setEntityType] = useState<"vision" | "outcome" | "bet" | "task" | "signal">("outcome");
  const [entityId, setEntityId] = useState("");
  const [relationType, setRelationType] = useState("context");
  const [includeInContext, setIncludeInContext] = useState(true);
  const [activeLinks, setActiveLinks] = useState<FileEntityLink[]>([]);

  const loadNodes = async () => {
    setLoading(true);
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : currentFolderId ? `?parentId=${currentFolderId}` : "?parentId=";
      const res = await fetch(`/api/vault/nodes${q}`);
      if (res.ok) {
        const data = await res.json();
        setNodes(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNodes();
  }, [currentFolderId, search]);

  const selectNode = async (node: FileNode) => {
    if (node.type === "directory") {
      setCurrentFolderId(node.id);
      setSelectedNode(null);
      return;
    }
    setSelectedNode(node);
    setEditContent(node.raw_content || "");
    // Load links
    try {
      const res = await fetch(`/api/vault/links?entityType=&entityId=`);
      if (res.ok) {
        const allLinks: FileEntityLink[] = await res.json();
        setActiveLinks(allLinks.filter((l) => l.file_node_id === node.id));
      }
    } catch { /* ignore */ }
  };

  const handleSaveContent = async () => {
    if (!selectedNode) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/vault/nodes/${selectedNode.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawContent: editContent }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedNode(updated);
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 2000);
        loadNodes();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    try {
      const res = await fetch("/api/vault/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentId: currentFolderId,
          name: createName.trim(),
          type: createType,
          rawContent: createInitialContent,
        }),
      });
      if (res.ok) {
        setCreateModalOpen(false);
        setCreateName("");
        setCreateInitialContent("");
        loadNodes();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this file or directory?")) return;
    try {
      const res = await fetch(`/api/vault/nodes/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedNode?.id === id) setSelectedNode(null);
        loadNodes();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddLink = async () => {
    if (!selectedNode || !entityId.trim()) return;
    try {
      const res = await fetch("/api/vault/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileNodeId: selectedNode.id,
          entityType,
          entityId: entityId.trim(),
          relationType,
          includeInContext,
        }),
      });
      if (res.ok) {
        setLinkModalOpen(false);
        setEntityId("");
        // Reload active links
        const refreshRes = await fetch(`/api/vault/links`);
        if (refreshRes.ok) {
          const all = await refreshRes.json();
          setActiveLinks(all.filter((l: FileEntityLink) => l.file_node_id === selectedNode.id));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveLink = async (linkId: string) => {
    try {
      await fetch(`/api/vault/links?id=${linkId}`, { method: "DELETE" });
      setActiveLinks((prev) => prev.filter((l) => l.id !== linkId));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-800">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-blue-500" />
            Context Vault & File Directory
          </h2>
          <p className="text-xs text-neutral-400 mt-1">
            Deterministic file management & context injection for agents, strategies, and tasks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCreateType("directory");
              setCreateModalOpen(true);
            }}
          >
            <FolderPlus className="w-4 h-4 mr-1 text-amber-400" />
            New Folder
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setCreateType("file");
              setCreateModalOpen(true);
            }}
          >
            <Plus className="w-4 h-4 mr-1" />
            New Document
          </Button>
        </div>
      </div>

      {/* Main Grid: File Tree + Document Editor & Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
        {/* Left Column: Explorer */}
        <div className="lg:col-span-5 flex flex-col space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-500" />
              <Input
                placeholder="Search documents or paths..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
            {currentFolderId && (
              <Button size="sm" variant="outline" onClick={() => setCurrentFolderId(null)} title="Root directory">
                / Root
              </Button>
            )}
          </div>

          <Card className="flex-1 overflow-hidden flex flex-col">
            <CardHeader className="py-3 px-4 border-b border-neutral-800/80 bg-[#121520]">
              <CardTitle className="text-xs font-mono uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                <span>Directory Structure</span>
                {currentFolderId && <span className="text-blue-400 lowercase">(subfolder)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-2 flex-1 overflow-y-auto divide-y divide-neutral-800/40">
              {loading ? (
                <div className="p-8 text-center text-xs text-neutral-500">Loading vault nodes...</div>
              ) : nodes.length === 0 ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  {search ? "No matching files found." : "This directory is empty. Create a file or folder."}
                </div>
              ) : (
                nodes.map((node) => {
                  const isSelected = selectedNode?.id === node.id;
                  const isDir = node.type === "directory";
                  return (
                    <div
                      key={node.id}
                      onClick={() => selectNode(node)}
                      className={`flex items-center justify-between p-2.5 rounded-md text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-600/20 text-white font-medium border border-blue-500/40"
                          : "hover:bg-neutral-800/60 text-neutral-300"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {isDir ? (
                          <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                        ) : node.name.endsWith(".json") || node.name.endsWith(".ts") ? (
                          <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                        )}
                        <span className="truncate">{node.name}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {isDir ? "dir" : `${Math.ceil(node.size_bytes / 1024)} KB`}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-neutral-500 hover:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(node.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Editor & Entity Linkage */}
        <div className="lg:col-span-7 flex flex-col space-y-4">
          {selectedNode ? (
            <div className="space-y-4">
              {/* Document Header & Actions */}
              <Card>
                <CardHeader className="py-3 px-4 border-b border-neutral-800/80 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-400" />
                      {selectedNode.name}
                    </CardTitle>
                    <CardDescription className="text-[11px] font-mono text-neutral-400 mt-0.5">
                      {selectedNode.path} • {selectedNode.size_bytes} bytes • Updated {formatDate(selectedNode.updated_at)}
                    </CardDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLinkModalOpen(true)}
                    >
                      <LinkIcon className="w-3.5 h-3.5 mr-1 text-purple-400" />
                      Link Entity
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveContent}
                      disabled={saving}
                      className={savedSuccess ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                    >
                      {savedSuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 mr-1" />
                          Saved!
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5 mr-1" />
                          {saving ? "Saving..." : "Save"}
                        </>
                      )}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-4 space-y-4">
                  {/* Active Entity Links */}
                  {activeLinks.length > 0 && (
                    <div className="p-2.5 rounded-md bg-[#141724] border border-neutral-800 space-y-2">
                      <p className="text-[10px] uppercase font-mono tracking-wider text-neutral-400">
                        Linked Context Entities (included in agent prompts)
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {activeLinks.map((link) => (
                          <div
                            key={link.id}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-neutral-900 border border-neutral-800 text-xs"
                          >
                            <Badge variant="outline" className="text-[9px] uppercase px-1 py-0">
                              {link.entity_type}
                            </Badge>
                            <span className="text-[11px] font-mono text-neutral-300">
                              {link.entity_id.slice(0, 8)}...
                            </span>
                            <span className="text-[10px] text-blue-400">({link.relation_type})</span>
                            <button
                              onClick={() => handleRemoveLink(link.id)}
                              className="text-neutral-500 hover:text-red-400 ml-1"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw Content Editor */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-neutral-400 font-mono">
                      <span>Document Markdown & Plaintext</span>
                      <span>~{Math.ceil(editContent.length / 4)} tokens</span>
                    </div>
                    <Textarea
                      rows={18}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Enter strategy notes, specifications, founder memos, or prompts..."
                      className="font-mono text-xs leading-relaxed bg-[#0c0e15] border-neutral-800"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="flex-1 flex flex-col items-center justify-center p-12 text-center border-dashed">
              <FileText className="w-10 h-10 text-neutral-600 mb-3" />
              <p className="text-sm font-medium text-neutral-300">No document selected</p>
              <p className="text-xs text-neutral-500 max-w-sm mt-1">
                Select a document from the vault directory on the left or create a new note to start drafting specs.
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create {createType === "directory" ? "Folder" : "Document"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Name</label>
              <Input
                placeholder={createType === "directory" ? "e.g. strategy" : "e.g. north_star_spec.md"}
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            {createType !== "directory" && (
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Initial Content (Markdown/Text)</label>
                <Textarea
                  rows={6}
                  placeholder="# Document Title\n\nEnter content..."
                  value={createInitialContent}
                  onChange={(e) => setCreateInitialContent(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link Entity Modal */}
      <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Document to Domain Entity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Entity Type</label>
              <select
                className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as any)}
              >
                <option value="outcome">Outcome</option>
                <option value="bet">Bet</option>
                <option value="task">Task</option>
                <option value="signal">Signal</option>
                <option value="vision">Vision</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Entity ID (UUID)</label>
              <Input
                placeholder="Paste UUID of the target entity"
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-neutral-400 mb-1 block">Relation Type</label>
              <select
                className="w-full bg-[#141722] border border-neutral-800 rounded-md p-2 text-xs text-neutral-200"
                value={relationType}
                onChange={(e) => setRelationType(e.target.value)}
              >
                <option value="context">Context (Injected into agent jobs)</option>
                <option value="specification">Specification</option>
                <option value="evidence">Evidence</option>
                <option value="reference">Reference</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="incContext"
                checked={includeInContext}
                onChange={(e) => setIncludeInContext(e.target.checked)}
                className="rounded border-neutral-800"
              />
              <label htmlFor="incContext" className="text-xs text-neutral-300">
                Include in deterministic Agent context compiler automatically
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddLink}>Attach Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
