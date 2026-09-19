# Nerve — Agent Bridge (Architecture Specification)

> **Status:** MVP implementation (this repo). Replaces the earlier multi-agent-society blueprint (Conductor,
> Strategist, Operator, Investigator, Librarian, Mirror + MCP + vault + vectors), which is deferred.
> **Principle:** jobs, not personas. Most calculation stays deterministic in-app.

## Job model

Five scoped, one-shot job types: `clarify-vision`, `challenge-bet`, `assess-signal`, `replan-work`,
`weekly-review`. Each run compiles a minimal deterministic context packet and returns at most one
proposal that the founder explicitly accepts or rejects. No personas, no memory across runs, no timers,
no auto-run on page load.

## Deterministic core (no agent needed)

Deadlines/overdue, status sorting (`src/prioritize.ts`), links, context compilation, cache keys, token
estimates, proposal validation and transactional apply. The app is fully usable with zero CLIs installed.

## Context compiler (`src/context.ts`)

Includes only: job type, affected outcome/bet/signal, relevant active tasks (max 10), latest related
signals (max 5), last related decisions (max 3). Static prompt prefix first, dynamic JSON last.
Prompt templates versioned (`PROMPT_VERSION = "v1"`); no timestamps/request IDs in the static prefix.

## Cache (`src/context.ts`, `job_cache` table)

Exact cache key = SHA-256(adapter | model | job type | prompt version | output schema version |
entity revision/content digest). Same state reuses the successful result; any meaningful state change
invalidates it. No semantic cache. Runs UI shows cache hit/miss and token estimate (~chars/4).

## Adapters (`src/agents/adapters.ts`, verified against current `--help`)

| Adapter | Invocation (argv array, no shell) | Safety |
|---|---|---|
| codex 0.153.4 | `codex exec --sandbox read-only --skip-git-repo-check --ephemeral [--model M] --output-schema F --json <prompt>` | read-only sandbox, ephemeral, JSONL parsed for final message |
| agy 1.1.17 | `agy -p --mode plan --sandbox --output-format json --json-schema F [--model M] <prompt>` | plan + sandbox mode, structured output |
| opencode 1.18.31 | `opencode run --pure --format json --dir <tempJobDir> [--model M] <prompt>` | temp cwd, pure mode, never `--auto` |
| pi 0.85.1 | `pi -p --mode json --no-session --no-tools --no-extensions --no-skills --no-context-files [--model M] -- <prompt>` | ephemeral, no tools/skills/context files |
| droid 0.221.0 | `droid exec --output-format json --disable-builtin-skills --cwd <tempJobDir> [-m M] <prompt>` | default read-only, no auto flags |

Never used: `--approve-for-me`, `--dangerously-skip-permissions`, `--skip-permissions-unsafe`, `--auto`,
full-access sandboxes. `NERVE_*_EXTRA_ARGS` (JSON array) is allowlist-filtered; shell fragments and unsafe
flags are dropped. Missing CLIs are detected (`--version` probe) and reported as unavailable.

## Trust boundaries

- Nerve supplies only a temporary job packet (instructions + scoped context JSON + schema hint) and uses
  a temporary working directory. It does not pass the DB path, repo, or whole transcript in the prompt.
- Child environment is allowlisted and excludes every `NERVE_*` variable. Provider credentials and CLI
  auth/config needed to run may still be accessible. Native CLI tools may access host resources under
  their own sandbox and permissions. These adapters are trusted local software, not OS-isolated workers.
- Timeout (default 120s, `NERVE_AGENT_TIMEOUT_MS`) and output cap (default 256KB, `NERVE_AGENT_MAX_OUTPUT`).
- Stdout is untrusted: each adapter has an isolated parser, and the final proposal is validated against a
  strict whitelist schema (`src/validate.ts`): only `vision|outcome|bet|task` entities, `create|update` ops,
  enumerated fields; `update` needs `id`; stale `expectedRevision` rejects the whole transaction.
- Human approval required: `acceptProposal`/`rejectProposal` (`src/proposals.ts`) run transactionally;
  reject-with-note stays audited in `decisions`.

## Deferred

MCP servers, vector/embeddings search, Markdown sync, background workers/schedulers, multi-agent
orchestration, autonomous execution tiers. None are in the MVP.
