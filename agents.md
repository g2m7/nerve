# Nerve — Multi-Agent System Architecture (Agents Specification)

> **Document:** `agents.md`  
> **Status:** Architectural Blueprint  
> **Runtime Environment:** Bun (`bun` native)  
> **Core Protocol:** Model Context Protocol (MCP) + Event-Driven Bus  
> **Philosophy:** *Autonomous execution with human sovereignty.* The user acts as Chairman / Director; the agents act as specialized staff managing strategy, scheduling, research, and knowledge curation.

---

## 1. Overview & Agentic Operating System Paradigm

In traditional productivity software, data is passive. The user is burdened with manual data entry, categorization, cross-referencing, and maintenance, inevitably leading to "productivity system decay."

In **Nerve**, data is active. The system is run by a collaborative team of specialized autonomous and semi-autonomous agents operating over a unified local-first database and Markdown vault.

```
                                 ┌──────────────┐
                                 │     USER     │
                                 │  (Director)  │
                                 └──────┬───────┘
                                        │ natural language / commands / reviews
                                        ▼
                         ┌──────────────────────────────┐
                         │        THE CONDUCTOR         │
                         │    (Orchestrator & Router)   │
                         └──────────────┬───────────────┘
                                        │
         ┌──────────────────┬───────────┴───────────┬──────────────────┐
         │                  │                       │                  │
         ▼                  ▼                       ▼                  ▼
┌─────────────────┐ ┌────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  THE STRATEGIST │ │  THE OPERATOR  │ │ THE INVESTIGATOR│ │  THE LIBRARIAN  │
│ (Goals & OKRs)  │ │ (Tasks & Time) │ │ (Deep Research) │ │ (Second Brain)  │
└────────┬────────┘ └────────┬───────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                  │                   │
         └───────────────────┴─────────┬────────┴───────────────────┘
                                       ▼
                       ┌────────────────────────────────┐
                       │   SHARED KNOWLEDGE & STATE     │
                       │ SQLite (Data) + Vault (MD)     │
                       │ Vector Index (sqlite-vec)      │
                       └────────────────────────────────┘
```

---

## 2. Agent Roster & Detailed Profiles

### 2.1 The Conductor (Master Orchestrator & Intent Dispatcher)
*   **Role:** Central switchboard and triage coordinator. It analyzes incoming requests, classifies intent, splits complex multi-step workflows, and routes them to domain agents.
*   **Operational Trigger:**
    *   Direct user prompts via CLI (`nerve ask ...`, `nerve do ...`) or Web Chat.
    *   Scheduled cron triggers (morning startup, evening review).
*   **Core Responsibilities:**
    *   Intent classification (Strategic, Task-oriented, Investigative, Archival).
    *   Sub-task decomposition and parallel execution dispatch.
    *   Aggregation and synthesis of multi-agent responses into clean, concise briefings.
*   **Tools & Interfaces:**
    *   Agent dispatch broker.
    *   Context router and system status reader.

---

### 2.2 The Strategist (Goals, OKRs & Alignment Agent)
*   **Role:** High-level strategic advisor that connects long-term vision to day-to-day execution and guards against drift.
*   **Operational Trigger:**
    *   Weekly review cycles (e.g., Sunday evenings).
    *   New goal / milestone creation.
    *   Ad-hoc user query: *"How are we progressing towards Q3 milestones?"*
*   **Core Responsibilities:**
    *   **Goal Decomposition:** Breaks high-level OKRs into actionable milestones and initiatives.
    *   **Drift Detection:** Identifies "orphaned tasks" (tasks not tied to any goal) and "stalled goals" (active objectives with zero completed tasks over 14 days).
    *   **Weekly Retrospective Generation:** Synthesizes completed tasks into progress percentages against active Key Results.
*   **Input / Output Artifacts:**
    *   *Reads:* `vault/10-goals/*.md`, Task completion logs in SQLite.
    *   *Writes:* `vault/10-goals/reviews/YYYY-Www-review.md`, updates goal frontmatter status.
*   **Key Tools:**
    *   `goals_list()`, `goals_create()`, `goals_update_progress()`, `calculate_alignment_score()`.

---

### 2.3 The Operator (Task Execution & Schedule Agent)
*   **Role:** Executive assistant focused on operational velocity, inbox triage, task hygiene, and realistic time allocation.
*   **Operational Trigger:**
    *   New inbox capture (`nerve capture "..."`).
    *   Morning daily briefing schedule (e.g., 07:30 AM).
    *   Task status changes.
*   **Core Responsibilities:**
    *   **Inbox Triage:** Takes unstructured quick thoughts from `vault/00-inbox/` and transforms them into structured tasks with title, estimated effort (minutes), energy level required, project tag, and deadline.
    *   **Daily Timeboxing:** Constructs a daily plan based on available calendar slots, task priority, and user energy rhythm (e.g., Deep Work in morning, Admin in afternoon).
    *   **Rollover & Hygiene:** Flags overdue tasks, suggests renegotiating dates or auto-archiving stale backlog items.
*   **Input / Output Artifacts:**
    *   *Reads:* `vault/00-inbox/*.md`, SQLite task queue, user calendar.
    *   *Writes:* `vault/20-tasks/daily/YYYY-MM-DD.md`, SQLite task state updates.
*   **Key Tools:**
    *   `tasks_create()`, `tasks_update()`, `tasks_search()`, `tasks_triage()`, `calendar_get_availability()`.

---

### 2.4 The Investigator (Autonomous Research & Ingestion Agent)
*   **Role:** Dedicated analytical researcher that turns URLs, raw papers, and research questions into structured, citeable knowledge artifacts.
*   **Operational Trigger:**
    *   User URL ingestion (`nerve ingest https://...`).
    *   Deep research prompt (`nerve research "Evaluate Rust vs Zig for embedded audio"`).
    *   Triggered by The Operator when a task requires missing domain knowledge.
*   **Core Responsibilities:**
    *   **Multi-Source Exploration:** Formulates targeted search queries, crawls top sources, extracts clean article text, and discards paywalls/ads.
    *   **Claim Verification & Cross-Referencing:** Identifies conflicting claims across sources and notes author credentials/bias.
    *   **Synthesis Memo Drafting:** Generates an executive-ready research brief with executive summary, core mechanisms, trade-off tables, key quotes, and source URLs.
*   **Input / Output Artifacts:**
    *   *Reads:* Web URLs, search engine APIs, local PDFs/EPUBs.
    *   *Writes:* `vault/30-research/<slug>.md` with structured frontmatter (`source`, `authors`, `tags`, `summary`).
*   **Key Tools:**
    *   `web_search()`, `web_scrape_readable()`, `extract_pdf_text()`, `generate_research_memo()`.

---

### 2.5 The Librarian (Second Brain & Knowledge Curator)
*   **Role:** Custodian of the long-term knowledge base. Builds associative memory graphs, detects connections, and surfaces relevant notes at the right time.
*   **Operational Trigger:**
    *   Filesystem watcher on `vault/` (on note create/modify).
    *   Background indexing cron (hourly vector updates).
    *   Active query from another agent (e.g., The Operator asking: *"What notes do we have on database migration patterns?"*).
*   **Core Responsibilities:**
    *   **Semantic Vector Indexing:** Generates chunked embeddings using `sqlite-vec` for all notes in the vault.
    *   **Auto-Linker & Entity Recognition:** Identifies mentions of existing notes and suggests bi-directional `[[WikiLinks]]`.
    *   **Knowledge Hygiene:** Flags duplicate notes, broken links, or conflicting concepts.
    *   **Serendipitous Recall:** Injects contextual note excerpts into the daily briefing based on the tasks planned for today.
*   **Input / Output Artifacts:**
    *   *Reads:* All markdown files across `vault/`.
    *   *Writes:* Modifies notes with suggested links; updates SQLite vector and FTS5 indices.
*   **Key Tools:**
    *   `brain_vector_search()`, `brain_keyword_search()`, `brain_find_backlinks()`, `brain_suggest_connections()`, `brain_reindex()`.

---

### 2.6 The Mirror (Reflection & Continuous Learning Agent)
*   **Role:** Self-awareness and meta-cognition coach. Evaluates how the user operates, tracks energy/focus trends, and improves agent recommendations over time.
*   **Operational Trigger:**
    *   Evening wind-down trigger (e.g., 20:30).
    *   End of week / month.
*   **Core Responsibilities:**
    *   Prompts low-friction retrospective check-ins (1-5 energy scale, 1 sentence summary).
    *   Tracks estimation accuracy (estimated task time vs. actual time).
    *   Adapts system prompts and agent heuristics based on user corrections.
*   **Input / Output Artifacts:**
    *   *Reads:* Completed tasks, daily logs.
    *   *Writes:* `vault/20-tasks/reviews/productivity-trends.md`.

---

## 3. Inter-Agent Communication & Memory Protocol

### 3.1 Shared Memory Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AGENT MEMORY HIERARCHY                       │
├─────────────────────────────────────────────────────────────────┤
│ 1. Working Memory (Short-Term)                                  │
│    - Current turn context window                                │
│    - Ephemeral agent step execution state                       │
├─────────────────────────────────────────────────────────────────┤
│ 2. Operational Memory (Mid-Term)                                │
│    - SQLite tables: `tasks`, `goals`, `active_workflows`, `logs`│
│    - Fast transactional state, lock queues, job statuses        │
├─────────────────────────────────────────────────────────────────┤
│ 3. Semantic Memory (Long-Term)                                  │
│    - `vault/*.md` human-readable notes                          │
│    - `sqlite-vec` embeddings of all notes and research          │
│    - Backlink graph of relationships and concepts               │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Event-Driven Message Flow
Agents communicate asynchronously via an internal typed event bus implemented in Bun:

```typescript
// Event contract example
type NerveEvent =
  | { type: 'inbox.captured'; payload: { rawText: string; source: string } }
  | { type: 'task.completed'; payload: { taskId: string; timeSpentMin: number } }
  | { type: 'research.requested'; payload: { query: string; depth: 'quick' | 'deep' } }
  | { type: 'research.completed'; payload: { memoPath: string; tags: string[] } }
  | { type: 'note.updated'; payload: { filePath: string; diff: string } }
  | { type: 'goal.drift_detected'; payload: { goalId: string; reason: string } };
```

---

## 4. Human-in-the-Loop (HITL) & Safety Matrix

To prevent chaos and maintain absolute user trust, agent actions are categorized into three permission tiers:

| Tier | Autonomy Level | Permitted Actions | Examples |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **Fully Autonomous** | Read-only operations, internal indexing, search, draft generation in scratchpad. | • Crawling web URLs<br>• Generating vector embeddings<br>• Reading tasks & notes<br>• Computing alignment scores |
| **Tier 2** | **Notify & Log** | Creating new draft notes, proposing daily schedules, adding tags, parsing inbox items into backlog. | • Creating a new research note in `vault/30-research/`<br>• Adding an inbox item to Todo<br>• Suggesting a WikiLink |
| **Tier 3** | **Explicit User Approval Required** | Modifying existing notes, deleting tasks/notes, altering goal definitions, rescheduling critical deadlines. | • Overwriting an existing note in `vault/40-brain/`<br>• Archiving or deleting goals<br>• Bulk editing task due dates |

---

## 5. Model Context Protocol (MCP) Tool Specifications

The multi-agent system exposes and consumes standard MCP tools. This enables external orchestrators (like Antigravity, Claude Desktop, or custom clients) to invoke Nerve capabilities uniformly.

### 5.1 Goals MCP Tools
*   `nerve_goals_list`: Retrieve active goals, OKRs, and alignment status.
*   `nerve_goals_create`: Define a new objective or key result.
*   `nerve_goals_audit_alignment`: Analyze how current active tasks map to goals.

### 5.2 Tasks MCP Tools
*   `nerve_tasks_list`: Query tasks by status, project, priority, or due date.
*   `nerve_tasks_create`: Add a new structured task with metadata.
*   `nerve_tasks_triage_inbox`: Process raw text from inbox into structured tasks.
*   `nerve_tasks_generate_daily_plan`: Synthesize a timeboxed schedule for the day.

### 5.3 Research MCP Tools
*   `nerve_research_scrape_url`: Ingest and convert a URL into clean readable Markdown.
*   `nerve_research_deep_scout`: Execute a multi-hop web research run on a query and output a synthesis memo.

### 5.4 Brain MCP Tools
*   `nerve_brain_search`: Execute a hybrid (vector + BM25 full-text) search across the user's vault.
*   `nerve_brain_read_note`: Retrieve note content and parsed frontmatter.
*   `nerve_brain_write_note`: Create or update a markdown note in the vault.
*   `nerve_brain_get_backlinks`: Retrieve the bi-directional link graph for a specific concept.

---

## 6. Implementation Strategy with Bun

All agents are implemented using native Bun capabilities:
1.  **Direct Execution:** Run agents directly via `bun run ./packages/agents/...` with zero compilation steps.
2.  **Fast SQLite & Vector:** Use `bun:sqlite` with native C FFI for high-speed vector distance calculations and transactions.
3.  **Native Web APIs:** Leverage native `fetch`, `WebSocket`, and streaming responses for LLM provider connections (OpenAI, Anthropic, Ollama, local models).
4.  **Process Management:** Background agent workers run as lightweight Bun processes monitored by the core Nerve daemon.
