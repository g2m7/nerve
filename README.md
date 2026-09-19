# Nerve — Solo-Founder Vision-to-Execution OS (MVP)

Local-first app: React + TypeScript frontend, Bun runtime, `bun:sqlite` as the sole authority.
No auth in the MVP. The server binds `127.0.0.1` by default — **do not expose it publicly**
(no auth, no hardening; anyone with network access could read/write your data).

## Setup / dev / test / build / start

```sh
bun install            # install dependencies (Bun only)
bun run typecheck      # strict tsc --noEmit
bun test               # unit tests (in-memory DB + fake adapter outputs; never calls a real agent)
bun run build          # vite production build into ./dist
bun run start          # serve API + dist UI on http://127.0.0.1:3030
```

Dev UI with hot reload (API proxied to :3030):

```sh
bun run dev            # API + Vite → http://127.0.0.1:5173
```

Environment (see `.env.example`): `PORT`, `HOST`, `NERVE_DB` (sqlite path),
`NERVE_AGENT_TIMEOUT_MS`, `NERVE_AGENT_MAX_OUTPUT`.

## Adapter safety / config

Agents are optional one-shot jobs (`clarify-vision`, `challenge-bet`, `assess-signal`,
`replan-work`, `weekly-review`). Detection runs `CLI --version`; missing CLIs show as
unavailable in the UI instead of breaking. Safe argv verified against current `--help`:

- codex: `exec --sandbox read-only --skip-git-repo-check --ephemeral --output-schema F --json`
- agy: `-p --mode plan --sandbox --output-format json --json-schema F`
- opencode: `run --pure --format json --dir <isolated job dir>` (never `--auto`)
- pi: `-p --mode json --no-session --no-tools --no-extensions --no-skills --no-context-files`
- droid: `exec --output-format json --disable-builtin-skills --cwd <isolated job dir>` (default read-only)

Overrides: `NERVE_<ADAPTER>_BIN`, `NERVE_<ADAPTER>_MODEL`, `NERVE_<ADAPTER>_EXTRA_ARGS`
(JSON array, allowlist-filtered — unsafe/auto-approval flags and shell fragments are dropped).
Nerve supplies only a temp job packet (scoped context + schema), uses a temp working directory,
and removes `NERVE_*` plus non-allowlisted environment variables. Provider credentials required by
the CLI may remain available. A CLI's native tools and authentication can still access host resources
according to that CLI's own sandbox/configuration; install only trusted CLIs and review their settings.
Nerve does not claim OS-level isolation. Stdout is untrusted, parsed per adapter, and validated against
a strict proposal schema. Stale revisions reject the whole transaction; founder decisions are audited.

## Layout

- `src/server.ts` — Bun.serve API + static dist serving
- `src/db.ts` — migrations; `src/repos.ts` — repositories; `src/validate.ts` — trust-boundary validation
- `src/prioritize.ts` — deterministic Now ordering; `src/context.ts` — context compiler + cache keys
- `src/proposals.ts` — transactional accept/reject; `src/agents/` — adapters + job runner
- `web/` — React UI (Focus / Direction / Review / System); `tests/` — focused unit tests
- `product.md`, `agents.md` — concise specs for what is actually built
