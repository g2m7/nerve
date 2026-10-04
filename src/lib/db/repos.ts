import { getDb, type DbClient } from "./index";
import type {
  Bet,
  Decision,
  FileEntityLink,
  FileNode,
  McpServer,
  Outcome,
  Proposal,
  ProposalChange,
  Signal,
  Task,
  Vision,
  AgentRun,
  AuditLog,
} from "../types";

function newId(): string {
  return crypto.randomUUID();
}

function parseJsonSafe<T>(val: unknown, fallback: T): T {
  if (typeof val === "object" && val !== null) return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export const dbGet = {
  async vision(db?: DbClient): Promise<Vision> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM visions WHERE id = 1");
    if (res.rows.length === 0) {
      await client.query("INSERT INTO visions (id, text, revision, updated_at) VALUES (1, '', 1, NOW())");
      return { id: 1, text: "", revision: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    }
    const historyRes = await client.query("SELECT * FROM vision_history WHERE vision_id = 1 ORDER BY created_at DESC LIMIT 20");
    return {
      ...res.rows[0],
      history: historyRes.rows,
    };
  },

  async outcomes(db?: DbClient): Promise<Outcome[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM outcomes ORDER BY created_at DESC");
    return res.rows;
  },

  async outcome(id: string, db?: DbClient): Promise<Outcome | null> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM outcomes WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  async bets(db?: DbClient): Promise<Bet[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM bets ORDER BY created_at DESC");
    return res.rows;
  },

  async bet(id: string, db?: DbClient): Promise<Bet | null> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM bets WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  async tasks(db?: DbClient): Promise<Task[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM tasks ORDER BY priority ASC, deadline ASC NULLS LAST, created_at DESC");
    return res.rows;
  },

  async task(id: string, db?: DbClient): Promise<Task | null> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM tasks WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  async signals(db?: DbClient): Promise<Signal[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM signals ORDER BY occurred_at DESC LIMIT 200");
    return res.rows;
  },

  async signal(id: string, db?: DbClient): Promise<Signal | null> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM signals WHERE id = $1", [id]);
    return res.rows[0] || null;
  },

  async proposals(status?: string, db?: DbClient): Promise<Proposal[]> {
    const client = db || (await getDb());
    let query = "SELECT * FROM proposals";
    const params: any[] = [];
    if (status) {
      query += " WHERE status = $1";
      params.push(status);
    }
    query += " ORDER BY created_at DESC LIMIT 100";
    const res = await client.query(query, params);
    return res.rows.map((row) => ({
      ...row,
      changes: parseJsonSafe<ProposalChange[]>(row.changes, []),
      evidence: parseJsonSafe<string[]>(row.evidence, []),
      affected: parseJsonSafe<string[]>(row.affected, []),
      cache_hit: Boolean(row.cache_hit),
    }));
  },

  async proposal(id: string, db?: DbClient): Promise<Proposal | null> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM proposals WHERE id = $1", [id]);
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      ...row,
      changes: parseJsonSafe<ProposalChange[]>(row.changes, []),
      evidence: parseJsonSafe<string[]>(row.evidence, []),
      affected: parseJsonSafe<string[]>(row.affected, []),
      cache_hit: Boolean(row.cache_hit),
    };
  },

  async decisions(db?: DbClient): Promise<Decision[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM decisions ORDER BY created_at DESC LIMIT 100");
    return res.rows;
  },

  async agentRuns(db?: DbClient): Promise<AgentRun[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT 100");
    return res.rows;
  },

  // ---------------- File & Context Vault Getters ----------------
  async fileNodes(parentId?: string | null, search?: string, db?: DbClient): Promise<FileNode[]> {
    const client = db || (await getDb());
    if (search && search.trim()) {
      const q = `%${search.trim().toLowerCase()}%`;
      const res = await client.query(
        "SELECT * FROM file_nodes WHERE LOWER(name) LIKE $1 OR LOWER(path) LIKE $1 ORDER BY type ASC, name ASC",
        [q]
      );
      return res.rows.map((r) => ({ ...r, metadata: parseJsonSafe(r.metadata, {}) }));
    }

    if (parentId !== undefined) {
      const res = parentId === null
        ? await client.query("SELECT * FROM file_nodes WHERE parent_id IS NULL ORDER BY type ASC, name ASC")
        : await client.query("SELECT * FROM file_nodes WHERE parent_id = $1 ORDER BY type ASC, name ASC", [parentId]);
      return res.rows.map((r) => ({ ...r, metadata: parseJsonSafe(r.metadata, {}) }));
    }

    const res = await client.query("SELECT * FROM file_nodes ORDER BY path ASC");
    return res.rows.map((r) => ({ ...r, metadata: parseJsonSafe(r.metadata, {}) }));
  },

  async fileNode(id: string, db?: DbClient): Promise<FileNode | null> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM file_nodes WHERE id = $1", [id]);
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return { ...r, metadata: parseJsonSafe(r.metadata, {}) };
  },

  async fileLinks(entityType?: string, entityId?: string, db?: DbClient): Promise<FileEntityLink[]> {
    const client = db || (await getDb());
    let sql = `
      SELECT l.*, n.name as file_name, n.path as file_path, n.type as file_type, n.mime_type
      FROM file_entity_links l
      JOIN file_nodes n ON l.file_node_id = n.id
    `;
    const params: any[] = [];
    if (entityType && entityId) {
      sql += " WHERE l.entity_type = $1 AND l.entity_id = $2";
      params.push(entityType, entityId);
    }
    sql += " ORDER BY l.created_at DESC";
    const res = await client.query(sql, params);
    return res.rows;
  },

  // ---------------- MCP Getters ----------------
  async mcpServers(db?: DbClient): Promise<McpServer[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM mcp_servers ORDER BY name ASC");
    return res.rows.map((r) => ({
      ...r,
      args: parseJsonSafe(r.args, []),
      env: parseJsonSafe(r.env, {}),
      headers: parseJsonSafe(r.headers, {}),
      cached_tools: parseJsonSafe(r.cached_tools, []),
    }));
  },

  async auditLogs(limit = 100, db?: DbClient): Promise<AuditLog[]> {
    const client = db || (await getDb());
    const res = await client.query("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT $1", [limit]);
    return res.rows;
  },
};

export const dbMut = {
  async setVision(text: string, db?: DbClient): Promise<Vision> {
    const t = text.trim();
    if (!t) throw new Error("Vision text cannot be empty");
    const client = db || (await getDb());
    return await client.transaction(async (tx) => {
      const cur = await dbGet.vision(tx);
      await tx.query(
        "INSERT INTO vision_history (id, vision_id, text, revision, created_at) VALUES ($1, 1, $2, $3, NOW())",
        [newId(), cur.text, cur.revision]
      );
      const res = await tx.query(
        "UPDATE visions SET text = $1, revision = revision + 1, updated_at = NOW() WHERE id = 1 RETURNING *",
        [t]
      );
      await dbMut.recordAudit("vision", "1", "UPDATE", cur, res.rows[0], tx);
      return res.rows[0];
    });
  },

  async createOutcome(b: Partial<Outcome>, db?: DbClient): Promise<Outcome> {
    const client = db || (await getDb());
    const id = newId();
    const title = (b.title || "").trim();
    if (!title) throw new Error("Outcome title is required");
    const res = await client.query(
      `INSERT INTO outcomes (id, title, description, status, confidence, target_date, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW()) RETURNING *`,
      [
        id,
        title,
        b.description || "",
        b.status || "active",
        b.confidence || "medium",
        b.target_date || null,
      ]
    );
    await dbMut.recordAudit("outcome", id, "CREATE", null, res.rows[0], client);
    return res.rows[0];
  },

  async updateOutcome(id: string, b: Partial<Outcome>, expectedRevision?: number, db?: DbClient): Promise<Outcome> {
    const client = db || (await getDb());
    return await client.transaction(async (tx) => {
      const cur = await dbGet.outcome(id, tx);
      if (!cur) throw new Error(`Outcome ${id} not found`);
      if (expectedRevision !== undefined && cur.revision !== expectedRevision) {
        throw new Error(`Revision mismatch: expected ${expectedRevision}, got ${cur.revision}`);
      }
      const title = b.title !== undefined ? b.title.trim() : cur.title;
      const res = await tx.query(
        `UPDATE outcomes SET
          title = $1,
          description = $2,
          status = $3,
          confidence = $4,
          target_date = $5,
          revision = revision + 1,
          updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [
          title,
          b.description !== undefined ? b.description : cur.description,
          b.status !== undefined ? b.status : cur.status,
          b.confidence !== undefined ? b.confidence : cur.confidence,
          b.target_date !== undefined ? b.target_date : cur.target_date,
          id,
        ]
      );
      await dbMut.recordAudit("outcome", id, "UPDATE", cur, res.rows[0], tx);
      return res.rows[0];
    });
  },

  async deleteOutcome(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    const cur = await dbGet.outcome(id, client);
    if (!cur) return;
    await client.query("DELETE FROM outcomes WHERE id = $1", [id]);
    await dbMut.recordAudit("outcome", id, "DELETE", cur, null, client);
  },

  async createBet(b: Partial<Bet>, db?: DbClient): Promise<Bet> {
    const client = db || (await getDb());
    const id = newId();
    const title = (b.title || "").trim();
    if (!title) throw new Error("Bet title is required");
    const res = await client.query(
      `INSERT INTO bets (id, outcome_id, title, assumption, rationale, confidence, status, review_date, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW()) RETURNING *`,
      [
        id,
        b.outcome_id || null,
        title,
        b.assumption || "",
        b.rationale || "",
        b.confidence || "medium",
        b.status || "open",
        b.review_date || null,
      ]
    );
    await dbMut.recordAudit("bet", id, "CREATE", null, res.rows[0], client);
    return res.rows[0];
  },

  async updateBet(id: string, b: Partial<Bet>, expectedRevision?: number, db?: DbClient): Promise<Bet> {
    const client = db || (await getDb());
    return await client.transaction(async (tx) => {
      const cur = await dbGet.bet(id, tx);
      if (!cur) throw new Error(`Bet ${id} not found`);
      if (expectedRevision !== undefined && cur.revision !== expectedRevision) {
        throw new Error(`Revision mismatch: expected ${expectedRevision}, got ${cur.revision}`);
      }
      const title = b.title !== undefined ? b.title.trim() : cur.title;
      const res = await tx.query(
        `UPDATE bets SET
          outcome_id = $1,
          title = $2,
          assumption = $3,
          rationale = $4,
          confidence = $5,
          status = $6,
          review_date = $7,
          revision = revision + 1,
          updated_at = NOW()
         WHERE id = $8 RETURNING *`,
        [
          b.outcome_id !== undefined ? b.outcome_id : cur.outcome_id,
          title,
          b.assumption !== undefined ? b.assumption : cur.assumption,
          b.rationale !== undefined ? b.rationale : cur.rationale,
          b.confidence !== undefined ? b.confidence : cur.confidence,
          b.status !== undefined ? b.status : cur.status,
          b.review_date !== undefined ? b.review_date : cur.review_date,
          id,
        ]
      );
      await dbMut.recordAudit("bet", id, "UPDATE", cur, res.rows[0], tx);
      return res.rows[0];
    });
  },

  async deleteBet(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    const cur = await dbGet.bet(id, client);
    if (!cur) return;
    await client.query("DELETE FROM bets WHERE id = $1", [id]);
    await dbMut.recordAudit("bet", id, "DELETE", cur, null, client);
  },

  async createTask(b: Partial<Task>, db?: DbClient): Promise<Task> {
    const client = db || (await getDb());
    const id = newId();
    const title = (b.title || "").trim();
    if (!title) throw new Error("Task title is required");
    const res = await client.query(
      `INSERT INTO tasks (id, title, status, priority, deadline, outcome_id, bet_id, blocked, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, NOW(), NOW()) RETURNING *`,
      [
        id,
        title,
        b.status || "open",
        b.priority || "p2",
        b.deadline || null,
        b.outcome_id || null,
        b.bet_id || null,
        b.blocked ? 1 : 0,
      ]
    );
    await dbMut.recordAudit("task", id, "CREATE", null, res.rows[0], client);
    return res.rows[0];
  },

  async updateTask(id: string, b: Partial<Task>, expectedRevision?: number, db?: DbClient): Promise<Task> {
    const client = db || (await getDb());
    return await client.transaction(async (tx) => {
      const cur = await dbGet.task(id, tx);
      if (!cur) throw new Error(`Task ${id} not found`);
      if (expectedRevision !== undefined && cur.revision !== expectedRevision) {
        throw new Error(`Revision mismatch: expected ${expectedRevision}, got ${cur.revision}`);
      }
      const title = b.title !== undefined ? b.title.trim() : cur.title;
      const res = await tx.query(
        `UPDATE tasks SET
          title = $1,
          status = $2,
          priority = $3,
          deadline = $4,
          outcome_id = $5,
          bet_id = $6,
          blocked = $7,
          revision = revision + 1,
          updated_at = NOW()
         WHERE id = $8 RETURNING *`,
        [
          title,
          b.status !== undefined ? b.status : cur.status,
          b.priority !== undefined ? b.priority : cur.priority,
          b.deadline !== undefined ? b.deadline : cur.deadline,
          b.outcome_id !== undefined ? b.outcome_id : cur.outcome_id,
          b.bet_id !== undefined ? b.bet_id : cur.bet_id,
          b.blocked !== undefined ? (b.blocked ? 1 : 0) : cur.blocked,
          id,
        ]
      );
      await dbMut.recordAudit("task", id, "UPDATE", cur, res.rows[0], tx);
      return res.rows[0];
    });
  },

  async deleteTask(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    const cur = await dbGet.task(id, client);
    if (!cur) return;
    await client.query("DELETE FROM tasks WHERE id = $1", [id]);
    await dbMut.recordAudit("task", id, "DELETE", cur, null, client);
  },

  async createSignal(b: Partial<Signal>, db?: DbClient): Promise<Signal> {
    const client = db || (await getDb());
    const id = newId();
    const title = (b.title || "").trim();
    if (!title) throw new Error("Signal title is required");
    const res = await client.query(
      `INSERT INTO signals (id, title, kind, evidence, outcome_id, bet_id, occurred_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) RETURNING *`,
      [
        id,
        title,
        b.kind || "note",
        b.evidence || "",
        b.outcome_id || null,
        b.bet_id || null,
        b.occurred_at || new Date().toISOString(),
      ]
    );
    await dbMut.recordAudit("signal", id, "CREATE", null, res.rows[0], client);
    return res.rows[0];
  },

  async deleteSignal(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    const cur = await dbGet.signal(id, client);
    if (!cur) return;
    await client.query("DELETE FROM signals WHERE id = $1", [id]);
    await dbMut.recordAudit("signal", id, "DELETE", cur, null, client);
  },

  // ---------------- Context Vault File & Directory Mutators ----------------
  async createFileNode(
    b: {
      parentId?: string | null;
      name: string;
      type: "directory" | "file" | "note" | "snippet";
      mimeType?: string;
      rawContent?: string;
      metadata?: Record<string, unknown>;
    },
    db?: DbClient
  ): Promise<FileNode> {
    const client = db || (await getDb());
    const id = newId();
    const name = b.name.trim();
    if (!name) throw new Error("File or folder name cannot be empty");

    let parentPath = "";
    if (b.parentId) {
      const parent = await dbGet.fileNode(b.parentId, client);
      if (!parent) throw new Error("Parent directory not found");
      parentPath = parent.path;
    }
    const path = `${parentPath}/${name}`.replace(/\/+/g, "/");
    const rawContent = b.rawContent || "";
    const sizeBytes = Buffer.byteLength(rawContent, "utf8");

    const res = await client.query(
      `INSERT INTO file_nodes (id, parent_id, name, type, path, mime_type, size_bytes, raw_content, metadata, revision, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), NOW()) RETURNING *`,
      [
        id,
        b.parentId || null,
        name,
        b.type,
        path,
        b.mimeType || (b.type === "directory" ? "inode/directory" : "text/markdown"),
        sizeBytes,
        rawContent,
        JSON.stringify(b.metadata || {}),
      ]
    );
    await dbMut.recordAudit("file_node", id, "CREATE", null, res.rows[0], client);
    return { ...res.rows[0], metadata: parseJsonSafe(res.rows[0].metadata, {}) };
  },

  async updateFileNode(
    id: string,
    b: { name?: string; rawContent?: string; metadata?: Record<string, unknown> },
    db?: DbClient
  ): Promise<FileNode> {
    const client = db || (await getDb());
    return await client.transaction(async (tx) => {
      const cur = await dbGet.fileNode(id, tx);
      if (!cur) throw new Error(`File node ${id} not found`);

      const name = b.name !== undefined ? b.name.trim() : cur.name;
      const rawContent = b.rawContent !== undefined ? b.rawContent : (cur.raw_content || "");
      const sizeBytes = Buffer.byteLength(rawContent, "utf8");

      let path = cur.path;
      if (b.name !== undefined && b.name !== cur.name) {
        const parts = cur.path.split("/");
        parts[parts.length - 1] = name;
        path = parts.join("/");
      }

      const res = await tx.query(
        `UPDATE file_nodes SET
          name = $1,
          path = $2,
          raw_content = $3,
          size_bytes = $4,
          metadata = $5,
          revision = revision + 1,
          updated_at = NOW()
         WHERE id = $6 RETURNING *`,
        [
          name,
          path,
          rawContent,
          sizeBytes,
          JSON.stringify(b.metadata !== undefined ? b.metadata : cur.metadata),
          id,
        ]
      );
      await dbMut.recordAudit("file_node", id, "UPDATE", cur, res.rows[0], tx);
      return { ...res.rows[0], metadata: parseJsonSafe(res.rows[0].metadata, {}) };
    });
  },

  async deleteFileNode(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    const cur = await dbGet.fileNode(id, client);
    if (!cur) return;
    await client.query("DELETE FROM file_nodes WHERE id = $1", [id]);
    await dbMut.recordAudit("file_node", id, "DELETE", cur, null, client);
  },

  async linkFileToEntity(
    b: {
      fileNodeId: string;
      entityType: "vision" | "outcome" | "bet" | "task" | "signal";
      entityId: string;
      relationType?: string;
      includeInContext?: boolean;
      notes?: string;
    },
    db?: DbClient
  ): Promise<FileEntityLink> {
    const client = db || (await getDb());
    const id = newId();
    const res = await client.query(
      `INSERT INTO file_entity_links (id, file_node_id, entity_type, entity_id, relation_type, include_in_context, notes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (file_node_id, entity_type, entity_id)
       DO UPDATE SET include_in_context = EXCLUDED.include_in_context, notes = EXCLUDED.notes
       RETURNING *`,
      [
        id,
        b.fileNodeId,
        b.entityType,
        b.entityId,
        b.relationType || "reference",
        b.includeInContext ?? false,
        b.notes || "",
      ]
    );
    return res.rows[0];
  },

  async removeFileLink(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    await client.query("DELETE FROM file_entity_links WHERE id = $1", [id]);
  },

  // ---------------- MCP Mutators ----------------
  async registerMcpServer(b: Partial<McpServer>, db?: DbClient): Promise<McpServer> {
    const client = db || (await getDb());
    const id = newId();
    const name = (b.name || "").trim();
    if (!name) throw new Error("MCP server name required");
    const res = await client.query(
      `INSERT INTO mcp_servers (id, name, transport, is_local, command, args, env, url, headers, enabled, cached_tools, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE SET
        transport = EXCLUDED.transport,
        is_local = EXCLUDED.is_local,
        command = EXCLUDED.command,
        args = EXCLUDED.args,
        env = EXCLUDED.env,
        url = EXCLUDED.url,
        headers = EXCLUDED.headers,
        updated_at = NOW()
       RETURNING *`,
      [
        id,
        name,
        b.transport || "stdio",
        b.is_local ?? true,
        b.command || null,
        JSON.stringify(b.args || []),
        JSON.stringify(b.env || {}),
        b.url || null,
        JSON.stringify(b.headers || {}),
        b.enabled ?? true,
        JSON.stringify(b.cached_tools || []),
      ]
    );
    return {
      ...res.rows[0],
      args: parseJsonSafe(res.rows[0].args, []),
      env: parseJsonSafe(res.rows[0].env, {}),
      headers: parseJsonSafe(res.rows[0].headers, {}),
      cached_tools: parseJsonSafe(res.rows[0].cached_tools, []),
    };
  },

  async deleteMcpServer(id: string, db?: DbClient): Promise<void> {
    const client = db || (await getDb());
    await client.query("DELETE FROM mcp_servers WHERE id = $1", [id]);
  },

  // ---------------- Audit Logging ----------------
  async recordAudit(
    entityName: string,
    entityId: string,
    action: string,
    prevState: unknown,
    newState: unknown,
    db?: DbClient
  ): Promise<void> {
    try {
      const client = db || (await getDb());
      await client.query(
        `INSERT INTO audit_logs (entity_name, entity_id, action, actor, previous_state, new_state, timestamp)
         VALUES ($1, $2, $3, 'founder', $4, $5, NOW())`,
        [
          entityName,
          entityId,
          action,
          prevState ? JSON.stringify(prevState) : null,
          newState ? JSON.stringify(newState) : null,
        ]
      );
    } catch (e) {
      console.warn("Audit logging error:", e);
    }
  },
};
