# Nerve — Solo-Founder Vision-to-Execution OS (Product Specification)

> **Status:** MVP implementation (this repo). Replaces the earlier broad personal-OS blueprint, which is deferred.
> **Runtime:** Bun only. **Storage:** `bun:sqlite` is the sole authority. **Server:** loopback (`127.0.0.1`) by default.

## What Nerve is

Nerve is a founder-intelligence tool for **one solo founder**. It turns a vision into measurable outcomes,
strategic bets with stated assumptions, deadline-driven tasks, observed signals from reality, and
founder-approved changes — while preserving founder sovereignty (nothing changes without explicit approval).

## Core loop

Vision → Outcomes → Bets/assumptions → Tasks/deadlines → Signals → Review/proposal → founder accept/edit/reject → versioned decisions.

## What Nerve is not (deferred scope)

Team admin, generic BI/CRM, general task manager, second brain/PKM, research platform, vector search,
Markdown vault sync, multi-agent societies, background schedulers, auth/multi-user. The old `product.md`/`agents.md`
described that broad system; it is intentionally not built here.

## MVP views

1. **Direction** — one editable vision (versioned history), outcomes with confidence/status/target date,
   bets with assumption/rationale/confidence/review date linked to outcomes.
2. **Now** — deterministic priorities: overdue first, then soonest deadline, then priority (p0 first);
   blocked tasks listed apart; quick capture with outcome/bet links.
3. **Review** — prominent "What changed?" signal capture, recent signals, scoped one-shot agent proposals
   with rationale, evidence, exact changes, cache status and token estimate; accept applies transactionally
   and writes a decision, reject writes a decision without changes; decision history (audit trail).
4. **Agents** (compact) — adapter availability, run history with cache/token info, config hints. Agents never
   auto-run; explicit founder action only. If no CLI is installed the UI explains instead of breaking.

## Rules

- Strategy changes are versioned/auditable, never silently overwritten.
- Empty app ships with no fake data; empty states explain the next step (create vision first).
- No dashboard clutter: no kanban, charts, glassmorphism, gradients, decorative animation, external fonts, emoji icons.
- Accessible: semantic HTML, system fonts, visible focus, keyboard-friendly forms, 44px touch targets, mobile layout.
