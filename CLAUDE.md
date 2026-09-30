# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A clickable frontend prototype of a shipment tracking app with AI features, built for the MarsBased technical test (brief: `docs/brief.pdf`). An industrial manufacturer ships from several sites through several logistics operators, by road and sea, domestically and internationally. The app unifies what each operator reports into one reliable view, for two roles.

Hard constraints from the brief:
- Frontend only: no backend, database or real integrations. Everything is mocked.
- Synthetic data only. Invent every company, operator, customer and document. Real place names are fine, real company names are not.
- AI is simulated with mock logic, but must look and behave like the real feature.
- 8-hour total budget: favour polish and judgment over coverage. No over-engineering.
- UI language: English.

## Commands

```bash
pnpm dev                          # dev server (webpack, see note below)
pnpm build                        # production build
pnpm lint                         # eslint
pnpm typecheck                    # next typegen + tsc (typegen provides globals like LayoutProps)
pnpm test                         # vitest, all unit tests
pnpm test src/ai/risk.test.ts     # single file
pnpm test -t "customs"            # tests whose name matches
```

`dev` and `build` pass `--webpack` because the native SWC binary (needed by Turbopack) is blocked by Windows Application Control on the author's machine; webpack falls back to WASM. Drop the flag if the binary loads.

Do not add dependencies without asking the user first. Installed stack: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui (radix-nova style), Zod 4, Vitest, Playwright, react-leaflet + OpenStreetMap tiles.

## Architecture

```
src/lib/clock.ts        DEMO_NOW: the only "now" in the app. Never call new Date() / Date.now() for business logic.
src/domain/             deterministic rules (not AI)
  types.ts              entity types (plain TS)
  operators.ts          per-operator raw payload Zod schemas, code→status maps, normalizeEvent()
  timeline.ts           unified multi-operator timeline, currentStatus, stale detection
  perimeter.ts          which shipments a user may see
src/ai/                 everything "AI", behind one interface
  types.ts              Zod schemas for every AI output (types inferred from them)
  service.ts            AiService interface + mockAiService
  risk.ts eta.ts query.ts   pure mock logic, unit tested
src/data/               synthetic data
  reference.ts          sites, customers, operators, demo users
  shipments.ts          shipments with raw events in each operator's native format
  index.ts              validates raw events with Zod → normalizes → TrackedShipment[]
```

Data flow: raw operator events (heterogeneous) → Zod validation → `normalizeEvent` → `Milestone` (keeps `rawCode`/`rawStatus` next to the normalized `status`) → `TrackedShipment` → AI services derive risk / ETA / next action / notices → UI.

## Principles (non-negotiable)

- **Reliability first.** Never invent a status or an ETA. Stored data is only what an operator reported. Status, risk, ETA and alerts are always derived, never stored.
  - `reliability: 'confirmed' | 'estimated'`: who says so (operator vs. us). The UI must always show the difference.
  - `confidence: 'high' | 'medium' | 'low'`: how sure an estimate is. A different concept; don't merge the two.
  - An unmapped operator code normalizes to `unknown` and is shown raw, never guessed.
- **Traceable normalization.** Keep the raw operator status and code alongside the normalized one.
- **AI behind `AiService`.** The UI only talks to the interface (async methods), so the mock can be swapped for an LLM/ML model without touching components. AI outputs are validated with Zod.
- **Zod only at trust boundaries:** raw operator payloads and AI outputs. Internal entities are plain TS types.
- **Business logic in pure functions**, outside components, unit tested (tests live next to the file: `x.test.ts`).
- **Server Components by default**; `"use client"` only where interaction requires it. Leaflet must be loaded with `next/dynamic` and `ssr: false`.
- TypeScript strict, no `any`.
- Conventional commits, small steps.

## Product scope

Roles are switched with a user selector (no real auth) that filters by perimeter: a customer sees only their shipments; an ops user sees the shipments of their sites.

- **Operations:** daily AI summary ("3 at risk, 1 held at customs…"), exception queue sorted by risk, filters by site and operator, natural-language search, shipment detail with unified timeline and a proposed next action.
- **Customer:** own shipments, ETA with confidence, proactive notices, simplified timeline, documents.
- **Cross-cutting:** "simulate operator update" button that injects an event and recomputes risk/ETA; small map only for out-for-delivery shipments; stale-data detection.
- **Out of scope:** real auth, fleet map, real document upload, email/SMS.

Demo hero scenarios that must stay intact in the mock data: (1) international shipment held at customs, (2) multimodal road→port→vessel→port→last-mile delayed at port, (3) stale shipment with no update for too long, (4) out for delivery with a 6–10 point route, (5) delivered on time.
