# Nerve — Personal Operating System (Product Specification)

> **Status:** Draft / Architectural Blueprint  
> **Target Runtime:** Bun (`bun` only)  
> **Storage Paradigm:** Local-First, File-backed (Markdown + SQLite / Vector)  
> **Philosophy:** *Composition over Invention* — integrate battle-tested open-source primitives into a cohesive, agent-augmented cognitive workspace.

---

## 1. Executive Summary & Vision

**Nerve** is a unified, local-first Personal Operating System (pOS) designed to bridge the chasm between **long-term life goals**, **daily task execution**, **in-depth research**, and **associative long-term memory (Second Brain)**.

Modern knowledge workers and builders are fragmented across disparate silos:
*   *Goals* live in Notion or spreadsheets, disconnected from daily actions.
*   *Tasks* live in Linear, Todoist, or Apple Reminders, divorced from strategic context.
*   *Research* is scattered across browser bookmarks, Raindrop, Readwise, and local PDFs.
*   *Knowledge & Notes* reside in Obsidian, Logseq, or Apple Notes without active agentic recall.

**Nerve** unifies these four pillars into an automated, feedback-driven loop:
1.  **Goals** dictate what tasks matter.
2.  **Tasks** generate execution logs and reveal knowledge gaps.
3.  **Research** investigates those gaps, sourcing and synthesizing external knowledge.
4.  **Second Brain** preserves, interlinks, and serves synthesized knowledge back to inform upcoming goals and tasks.

Instead of building every sub-system from scratch, Nerve leverages battle-tested schemas, engines, and protocols from the Open Source Software (OSS) ecosystem, binding them together with a fast, type-safe Bun runtime and an intelligent multi-agent orchestration layer.

---

## 2. The Four Pillars

```
                     ┌────────────────────────────────────────┐
                     │             1. GOALS                   │
                     │  Vision, OKRs, Milestones, Alignment   │
                     └──────────────────┬─────────────────────┘
                                        │ decomposes into
                                        ▼
┌───────────────────────────────────────┴───────────────────────────────────────┐
│                                 2. TASKS                                      │
│               GTD, Priority Queue, Time-boxing, Execution Logs                │
└──────────────────┬────────────────────────────────────────────┬───────────────┘
                   │ surfaces gaps                              │ feeds context
                   ▼                                            ▼
┌───────────────────────────────────────┐    synthesizes   ┌────────────────────┐
│             3. RESEARCH               ├─────────────────►│  4. SECOND BRAIN   │
│ Ingestion, Deep Crawl, Synthesis Docs │                  │ Graph, Vector, PKM │
└───────────────────────────────────────┘                  └─────────┬──────────┘
                   ▲                                                 │
                   └────────────────── queries context ──────────────┘
```

### Pillar 1: Goals & Strategy Engine
*   **Purpose:** Provide top-down directional clarity and ensure daily actions align with macro objectives.
*   **Structure:**
    *   *North Star / Life Vision:* 1-5 year overarching intentions.
    *   *OKRs (Objectives & Key Results):* Quarterly measurable goals.
    *   *Milestones:* High-level epics with concrete acceptance criteria.
    *   *Alignment Score:* Dynamic evaluation metric determining how many active tasks trace back directly to active OKRs.
*   **OSS References & Schemas:**
    *   Data model inspired by **Plane** (`workspaces`, `initiatives`, `cycles`) and **Linear** (Projects, Milestones, Roadmaps).

### Pillar 2: Execution & Task Management
*   **Purpose:** High-velocity, friction-free daily capture, prioritization, and completion of work.
*   **Structure:**
    *   *Capture / Inbox:* Zero-friction intake buffer for tasks, thoughts, and quick items.
    *   *Triage & Prioritization:* Eisenhower Matrix (Urgent vs. Important) + energy-level tag matching (High Focus vs. Low Energy).
    *   *Scheduling:* Daily agenda, Kanban board view, and time-block calendar integration.
    *   *Audit Trail:* Completed tasks generate structured changelogs that link to milestones.
*   **OSS References & Schemas:**
    *   Task schema & recurring engine adapted from **Vikunja** and **Super Productivity**.
    *   State machine model (Inbox -> Backlog -> Todo -> In Progress -> In Review -> Done / Canceled) inspired by **Linear** and **Taskwarrior**.

### Pillar 3: Research Ingestion & Deep Synthesis
*   **Purpose:** Ingest raw information from the web/documents, parse signal from noise, and produce structured analytical synthesis.
*   **Structure:**
    *   *Universal Ingestion:* Web URLs, articles, PDFs, YouTube transcripts, and raw notes.
    *   *Content Normalization:* Markdown conversion, metadata extraction, reader-mode HTML stripping.
    *   *Deep Research Pipelines:* Recursive web crawling, multi-source claim verification, and comparative synthesis.
    *   *Artifact Generation:* Executive summaries, literature reviews, and decision matrices.
*   **OSS References & Schemas:**
    *   Reader & scraping pipelines adapted from **Crawl4AI**, **Mozilla Readability**, and **Omnivore** (open-core data contracts).
    *   Archival and bookmark storage patterns inspired by **ArchiveBox** and **Karakeep / Hoarder**.

### Pillar 4: Second Brain (PKM & Associative Memory)
*   **Purpose:** Human-readable, durable knowledge store augmented with high-dimensional vector search and graph associations.
*   **Structure:**
    *   *Storage Format:* Pure Markdown files with YAML frontmatter stored in a local directory (`vault/`). Zero vendor lock-in.
    *   *Linking:* Wiki-links (`[[Note Title]]`), block references, and bi-directional backlink graphs.
    *   *Organization:* Hybrid PARA (Projects, Areas, Resources, Archives) + Zettelkasten slip-box for atomic notes.
    *   *Semantic Recall:* Local vector embeddings (`sqlite-vec` / fast embeddings) enabling hybrid search (BM25 full-text search + semantic similarity).
*   **OSS References & Schemas:**
    *   Note structure compatible with **Obsidian**, **Logseq**, and **SilverBullet**.
    *   Graph algorithms and link extractors adapted from **Foam** and **Dendron**.

---

## 3. Open Source Leverage Matrix

Instead of building custom components where standard solutions exist, Nerve incorporates and adapts proven open-source implementations:

| Domain | Functional Need | Selected OSS Base / Pattern | What We Adopt | Why Bun / Local-First? |
| :--- | :--- | :--- | :--- | :--- |
| **Data & Filesystem** | Note Storage & Markdown Parser | **SilverBullet / Unified / Remark** | AST parser, markdown serialization, WikiLink plugins | Fast AST processing directly in Bun; human-readable local files. |
| **Search & Memory** | Hybrid Search (Vector + Full-Text) | **SQLite-vec + SQLite FTS5** | Vector similarity extension + BM25 indexing in SQLite | Bundled in single file via `bun:sqlite`; zero external server overhead. |
| **Task Management** | Task Model & Recurrence Engine | **Vikunja (Schema) + RRule** | Recurrence rules, priority weighting, task dependency DAG | Clean task relations, proven field taxonomy. |
| **Research Extraction** | Web Scraping & Ingestion | **Readability.js + Turndown + Cheerio** | Clean reader mode, HTML-to-Markdown, metadata extraction | Fully runs in Bun without requiring heavy Chromium instances for standard articles. |
| **Deep Research** | Web Search & Exploration | **Crawl4AI patterns + SearXNG / Tavily client** | Multi-hop search queries, claim extraction patterns | Modular search backends configurable per environment. |
| **API & Server** | Backend HTTP / WebSocket Gateway | **Hono / Elysia** | Route declarations, type safety, OpenAPI / Swagger generation | Ultra-fast native performance on Bun, zero Node.js polyfill bloat. |
| **Agent Interface** | Tool Calling & Integration | **Model Context Protocol (MCP)** | Client and Server SDKs for tool discovery and execution | Universal standard; enables Nerve to plug into Antigravity, Claude, and local agents. |
| **Frontend / UI** | Local Desktop / Web Workspace | **Vite + React / Solid + Tailwind + Lucide** | Fast reactivity, Kanban boards, Graph visualizer (Force Graph / Cytoscape) | Clean component libraries, instant Bun dev server startup. |

---

## 4. System Architecture & Tech Stack

### 4.1 Technology Stack (Bun-Only Runtime)

*   **Runtime & Package Manager:** **Bun** (Strict constraint: `bun`, `bun run`, `bun test`, `bun add`).
*   **Primary Language:** TypeScript (strict mode, ESNext modules).
*   **Application Server:** **Elysia** or **Hono** (running on native Bun HTTP).
*   **Database & Storage:**
    *   `bun:sqlite` with native C-bindings.
    *   `sqlite-vec` extension for local vector indexing.
    *   SQLite `FTS5` for blazing-fast full-text search.
    *   Filesystem: Human-readable markdown repository (`vault/`) mirrored to SQLite indices.
*   **Tooling Protocol:** **Model Context Protocol (MCP)** for exposing Nerve tools to external LLM frontends and internal agents.
*   **Background Jobs & Scheduler:** Lightweight SQLite-backed queue (`litequeue`) with cron scheduling running directly inside the Bun process.

### 4.2 Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          USER INTERFACES                               │
│     CLI (`nerve ...`)   │   Web Workspace (SPA)   │   MCP Clients      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        NERVE RUNTIME (BUN)                             │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │                 API & Dispatch Gateway (Hono)                  │   │
│   │     REST Endpoints  │  SSE Streams  │  MCP Server Tool RPC     │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │                                     │
│   ┌──────────────────────────────┴─────────────────────────────────┐   │
│   │                     MULTI-AGENT ORCHESTRATOR                   │   │
│   │   (Planner, Task Operator, Research Scout, Brain Librarian)    │   │
│   └──────────────────────────────┬─────────────────────────────────┘   │
│                                  │                                     │
│   ┌──────────────────────────────┴─────────────────────────────────┐   │
│   │                    CORE DOMAIN SERVICES                        │   │
│   │  [Goals Service] [Tasks Service] [Research Eng] [Brain Service] │   │
│   └──────────────┬───────────────────────────────┬─────────────────┘   │
│                  │                               │                     │
│                  ▼                               ▼                     │
│   ┌─────────────────────────────┐ ┌────────────────────────────────┐   │
│   │     PERSISTENCE LAYER       │ │         INGESTION LAYER        │   │
│   │  - SQLite (Data, Jobs, FTS5)│ │  - Readability / Cheerio       │   │
│   │  - sqlite-vec (Embeddings)  │ │  - PDF & Media Parser          │   │
│   │  - `vault/*.md` (Markdown)  │ │  - Headless Fetcher            │   │
│   └─────────────────────────────┘ └────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Data Flow & Inter-Pillar Synergy

### 5.1 The Strategic Loop (Goal -> Task -> Execution)
1.  **Define:** The user creates or updates a quarterly Objective: *"Launch product beta by Q4"*.
2.  **Decompose:** The Strategist Agent generates proposed Key Results and Milestones.
3.  **Schedule:** High-priority Milestones expand into concrete tasks tagged with `#project/beta`.
4.  **Execute:** Tasks are tracked through Kanban / Daily Timeboxing. Completion updates milestone progress metrics.

### 5.2 The Cognitive Loop (Research -> Synthesis -> Brain)
1.  **Ingest:** User shares an article or topic (e.g. `nerve research "local-first sync architectures"`).
2.  **Deep Scout:** The Research Agent crawls references, extracts core concepts, and evaluates pros/cons.
3.  **Synthesize:** A structured Markdown synthesis note is drafted in `vault/research/local-first-sync.md`.
4.  **Index & Link:** The Librarian Agent indexes the note into `sqlite-vec`, automatically links it to related notes (e.g., `[[CRDTs]]`, `[[SQLite In Bun]]`), and suggests a follow-up task: *"Implement SQLite-vec indexing prototype"*.

---

## 6. Directory & Workspace Structure

```
nerve/
├── package.json               # Bun package manifest
├── bun.lockb                  # Bun binary lockfile
├── tsconfig.json              # Strict TypeScript config
├── product.md                 # Product specifications (this document)
├── agents.md                  # Multi-agent architecture specification
├── apps/
│   ├── api/                   # Bun backend service (Hono/Elysia)
│   ├── web/                   # Web workspace UI (React/Vite/Tailwind)
│   └── cli/                   # Nerve CLI command runner
├── packages/
│   ├── core/                  # Domain logic (Goals, Tasks, Research, Brain)
│   ├── db/                    # bun:sqlite database migrations and repositories
│   ├── search/                # FTS5 + sqlite-vec vector engine
│   ├── scraper/               # Reader mode and document ingestion utilities
│   └── mcp/                   # Model Context Protocol server exposing Nerve tools
└── vault/                     # The user's personal markdown knowledge base
    ├── 00-inbox/              # Raw thoughts and quick captures
    ├── 10-goals/              # OKRs, Milestones, and Vision documents
    ├── 20-tasks/              # Task logs, projects, and agendas
    ├── 30-research/           # External research reports and literature notes
    └── 40-brain/              # Evergreen atomic notes, concepts, and wiki
```

---

## 7. Roadmap & Implementation Phases

### Phase 1: Storage & Foundation (Core Vault & DB)
*   Setup Bun workspace monorepo.
*   Implement `vault/` filesystem watcher and bi-directional Markdown sync.
*   Implement SQLite database schema for Tasks, Goals, and Metadata.
*   Set up `sqlite-vec` + FTS5 indexer for all markdown files in `vault/`.

### Phase 2: Execution & Knowledge Engine
*   CLI and API endpoints for CRUD on Tasks and Goals.
*   GTD capture pipeline (`nerve task add ...`).
*   Ingestion service for URLs (Readability + Turndown markdown generation).
*   Backlink indexer (WikiLink `[[Note]]` parser and graph resolver).

### Phase 3: Agent Orchestration Layer
*   Deploy Agent runtime (defined in `agents.md`).
*   Implement MCP Server so Antigravity and external LLMs can interact with Nerve directly.
*   Automated daily briefings and goal-drift detection.

### Phase 4: Full UI & Local Dashboard
*   Unified Web Dashboard: Goal tree view, Kanban execution board, Research reading list, and Second Brain visual graph.
*   Offline-first desktop packaging.
