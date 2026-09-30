# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A clickable frontend prototype of a shipment tracking app with AI features, built for the MarsBased technical test (brief: `docs/brief.pdf`, gitignored and local only, never commit it). An industrial manufacturer ships from several sites through several logistics operators, by road and sea, domestically and internationally. The app unifies what each operator reports into one reliable view, for two roles.

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
pnpm test:e2e                     # Playwright demo flow; starts its own dev server on :3200
```

Playwright needs Chromium once (`pnpm exec playwright install chromium`). When checking the UI in a browser, use `localhost`, not `127.0.0.1`: Next dev blocks its dev resources for other origins, which breaks hydration.

`dev` and `build` pass `--webpack` because the native SWC binary (needed by Turbopack) is blocked by Windows Application Control on the author's machine; webpack falls back to WASM. Drop the flag if the binary loads.

Do not add dependencies without asking the user first. Installed stack: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4, shadcn/ui (radix-nova style), Zod 4, Vitest, Playwright, react-leaflet + OpenStreetMap tiles.

## Architecture

```
src/lib/clock.ts        DEMO_NOW (2026-10-07T07:00Z): the only "now". Never use new Date()/Date.now() for business logic.
                        Formatters use a fixed Europe/Madrid zone so output is machine-independent.
                        startOfDay() = Madrid calendar day ("today", "this week"); zonedParts/fromZoned convert local wall-clock times (Intl, DST-aware).
src/domain/             deterministic rules (not AI)
  types.ts              entity types (plain TS). ShipmentDocument, not Document (clashes with the DOM global)
  operators.ts          4 fictional operators: per-operator raw Zod schema, code→status map, normalizeEvent().
                        Formats without an offset (Tarnwick, Alpenweg) are read in the operator's timeZone.
  timeline.ts           track(): raw events → TrackedShipment; currentStatus, activeLeg, reportedEta, isStale, unifiedTimeline
  perimeter.ts          visibleShipments(user, shipments)
src/ai/                 everything "AI"
  types.ts              Zod schemas for every AI output (types inferred from them)
  eta.ts risk.ts query.ts   pure mock logic: ETA with range/confidence, risk score/flags/reasons, NL query parser + matcher
  service.ts            AiService interface + mockAiService; next action, daily summary, customer notice, search answer, code-mapping suggestion; factsFor()
src/data/               synthetic data
  reference.ts          sites, customers, ports/hubs, demo users
  shipments.ts          20 shipments authored as raw payloads in each operator's native format, hours relative to DEMO_NOW;
                        SIMULATED_UPDATES holds the next raw event per hero shipment (for "simulate operator update"); SIMULATED_WHILE_FILE_INCOMPLETE the hold SHP-1001 repeats first
  index.ts              SHIPMENTS = RAW_SHIPMENTS.map(track); nextOperatorMessage, withMessages, getShipment, siteOf, customerOf
src/ai/index.ts         `ai`: the single AiService instance the UI uses (swap point)
src/app/
  demo.ts               getDemo(): user, simulated ids and completed actions from cookies → perimeter-filtered shipments; loadFacts() via `ai`
  actions.ts            Server Actions: switchUser (known user ids), simulateUpdate (any role, a demo control; only shipments in the user's perimeter),
                        completeAction (ops only, perimeter), resetDemo
  page.tsx              "/" → OpsDashboard or CustomerHome by role; search/filters are URL params (q, site, op, view)
  shipments/[id]        detail by role; outside the perimeter → notFound()
src/components/
  shipment-bits.tsx     shared status/reliability/confidence/risk/ETA presentation (Pill, STATUS labels, etaText)
  ops-dashboard.tsx, customer-home.tsx, shipment-detail.tsx   the screens (Server Components)
  client-controls.tsx, delivery-map*.tsx                       the only client components (LiveRefresh: ops header, router.refresh() every 60 s; off with LIVE_REFRESH=off, set by Playwright)
e2e/demo.spec.ts        the demo script as a Playwright test
```

Demo state is three cookies (`demo-user`, `demo-sim`, `demo-done`). `demo-sim` stores the operator messages received, in arrival order (`shp-1001:hold,shp-1001:update`): the variant is chosen when Simulate is pressed and replayed as stored, so a later upload never rewrites a message already received. Completing a proposed action takes the shipment out of the "Needs attention" queue until a new operator update reopens it; uploading a document flips it to available, which recomputes risk and the next action. A customer sees a `warning` notice only after ops sent it (`noticeForCustomer` in demo.ts); `info` notices are automatic. A Server Action that sets them re-renders the page, so there is no client-side store. Violet + sparkles marks AI output throughout the UI; keep that convention.

Data flow: raw operator events → Zod validation → `normalizeEvent` → `Milestone` (keeps `rawCode`/`rawStatus` next to the normalized `status`) → `TrackedShipment` → `factsFor` / `AiService` derive status, ETA, risk, next action and notices → UI.

- Simulating an operator update appends the stored message's raw event and re-runs `track()` (`withMessages`); everything downstream is recomputed. Same-timestamp messages keep arrival order (stable sort).
- Normalization is contextual: operators report per leg, so `delivered` on a non-final leg becomes a handover (`at_port`/`in_transit`) in `track()`. Malformed payloads land in `invalidEvents` instead of being dropped silently.
- Tests pin the demo: `src/data/index.test.ts`, `risk.test.ts` and `service.test.ts` assert the hero scenarios, the risk ranking and the exact ops headline. Changing mock data or heuristics will intentionally break them; update the expectations on purpose.
- `NOTE(simplification):` comments mark deliberate simplifications and their upgrade path.

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
