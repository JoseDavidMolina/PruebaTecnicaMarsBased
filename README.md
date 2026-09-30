# Arvenza Shipment Tracker

Clickable prototype for the MarsBased technical test. It gives consolidated, reliable, end-to-end shipment visibility for a manufacturer that ships from several sites through several logistics operators, by road and sea. There are two roles: **operations**, who manage by exception, and **customers**, who self-serve.

Frontend only. All data is synthetic, and the AI is simulated with deterministic mock logic behind a real interface.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `pnpm test` | Unit tests (Vitest): normalization, ETA, risk, query parser, demo scenarios |
| `pnpm test:e2e` | Playwright run of the demo flow (first time: `pnpm exec playwright install chromium`) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript (strict) |
| `pnpm build` | Production build |

The app runs on a fixed demo clock (**Wed 7 Oct 2026, 09:00 Madrid**), so every run looks the same.

## Five-minute demo

1. **Operations (Marta, control tower).** The AI daily briefing summarizes the day: *5 at risk (1 held at customs, 1 delayed at port, 1 with no recent update, 1 with a delivery incident, 1 running late)*. Each KPI opens the matching search. Below it, the exception queue is sorted by AI risk score, with a proposed action per shipment.
2. **Search in plain English.** Try *"what's going on with order 12345?"* or *"shipments to France this week running late"*. The chips show how the query was interpreted, and words it could not use are listed, never silently guessed.
3. **SHP-1002, multimodal and delayed at port.** The unified timeline merges three operators (road → sea → road). Each step shows the operator's raw status (`Code 60`, `ANC · MXVER`) next to our normalized one. The ETA is *estimated*, with range and confidence, and explains why. The risk card proposes notifying the customer and shows the drafted notice.
4. **Simulate operator update.** The vessel berths, a new event arrives in Blue Meridian's own format, and the ETA, risk and customer notice are all recalculated (2 days late → 12 hours late). "Reset demo" in the header replays it.
5. **Other heroes:**
   - SHP-1001: held at customs, invoice missing → *upload document*.
   - SHP-1003: stale, no update for 4 days → *contact operator*. It is shown as "Unconfirmed", never "On time".
   - SHP-1014: undocumented operator code, shown as "Unrecognised update" instead of being guessed; the ETA drops to medium confidence and ops is asked to check it with the operator.
6. **Switch "Viewing as" to Claire (Solenne Équipements).** She sees only her own shipments, proactive notices, and a *confirmed* delivery window with a live map for the parcel out for delivery.
7. **Switch to Tomáš (Brno).** Same dashboard, limited to one site's perimeter.

## How it is built

- **Next.js App Router, Server Components by default.** Demo state (active user, applied updates) lives in two cookies changed by Server Actions. Search and filters are URL params. Client JS is limited to the switchers, the pending buttons and the map (react-leaflet, loaded with `ssr: false`).
- **`src/domain`: deterministic rules.**
  - Each operator's raw feed is validated with Zod and normalized through its own code map.
  - Unknown codes become `unknown`, and malformed messages are kept aside.
  - The layer also builds the unified timeline, detects stale data and filters by role perimeter.
- **`src/ai`: everything "AI"**, behind the `AiService` interface (risk, ETA, next action, daily summary, query parsing, customer notice). The mock is pure functions, and every output is validated against Zod schemas, as a real model's output would be. `src/ai/index.ts` is the single swap point.
- **`src/data`: synthetic data.** Four fictional operators with deliberately different formats (numeric codes, free text, port events with UN/LOCODEs, German short codes), three sites, seven customers and 20 shipments.
- **Reliability rule.** Stored data is only what operators reported. Every ETA and milestone is labelled **Confirmed** (the operator said so) or **Estimated** (we computed it), and estimates always carry a confidence level.
