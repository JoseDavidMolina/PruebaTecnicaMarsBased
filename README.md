# Oskendra Shipment Tracker

Clickable prototype for the MarsBased technical test. It gives consolidated, reliable, end-to-end shipment visibility for a manufacturer that ships from several sites through several logistics operators, by road and sea. There are two roles: **operations**, who manage by exception, and **customers**, who self-serve.

Frontend only. All data is synthetic, and the AI is simulated with deterministic mock logic behind a real interface.

The write-up (approach, where AI adds value, path to production) was sent by email, alongside this repository.

## Run it

Requires Node 20+ and pnpm.

```bash
pnpm install        # also generates Next's route types, so a bare `tsc --noEmit` works
pnpm dev            # http://localhost:3000
```

`dev` and `build` pass `--webpack` because Turbopack needs Next's native SWC binary, which Windows Application Control blocks on the author's machine; webpack falls back to WASM. On other machines you can drop the flag.

| Command                        | What it does                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `pnpm test`                    | Unit tests (Vitest): normalization, ETA, risk, query parser, demo scenarios           |
| `pnpm test:e2e`                | Playwright run of the demo flow (first time: `pnpm exec playwright install chromium`) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript (strict)                                                          |
| `pnpm format` / `format:check` | Prettier: format / check the whole repo                                               |
| `pnpm build`                   | Production build                                                                      |

The app runs on a fixed demo clock (**Wed 7 Oct 2026, 09:00 Madrid**), so every run looks the same. Every time is shown in Madrid time and labelled with its zone (_09:00 CEST_), whoever is viewing.

## Five-minute demo

1. **Operations (Marta, control tower).** The AI daily briefing summarizes the day: _Today: 5 at risk (1 held at customs, 1 delayed at port, 1 with no recent update, 1 with a delivery incident, 1 running late), 1 out for delivery, 1 delivered._ "Today" is the Madrid calendar day, and each KPI opens the matching search with the same count. With a site or operator filter, the briefing and KPIs describe only what the filter shows (_· Brno Plant only_). Below it, the exception queue is sorted by AI risk score, with a proposed action per shipment that can be carried out in one click. A handled shipment leaves the queue ("1 handled today", also added to the briefing) until a new operator update reopens it.
2. **Search in plain English.** Try _"what's going on with order 12345?"_ or _"shipments to France this week running late"_. The assistant answers in a sentence built only from the shipment's facts, the chips show how the query was interpreted, and words it could not use are listed, never silently guessed. A typo in a country or operator is used but shown (_"To France (from 'frnace')"_), and a query it cannot understand at all (_"shipments to Narnia by dragon"_) matches nothing and says so instead of listing all 20.
3. **SHP-1002, multimodal and delayed at port.** The unified timeline merges three operators (road → sea → road) and folds repeated reports ("At sea" ×3) into one step you can expand. Each step shows the operator's raw status (`Code 60`, `ANC · MXVER · MV Aurora Tide`) next to our normalized one, and the header says how fresh the data is. The ETA is _estimated_, with range and confidence, and explains why. The risk card proposes notifying the customer. The drafted notice is marked _Not visible to the customer yet_; _Send notice_ makes it _Sent · visible to the customer_.
4. **Simulate operator update.** The vessel berths, a new event arrives in Blue Meridian's own format, and the ETA, risk and customer notice are all recalculated (2 days late → 12 hours late). The new figures go back to draft until ops sends them again. "Reset demo" in the header replays it.
5. **Other heroes:**
   - SHP-1001: held at customs, invoice missing → _Upload_. The invoice becomes available and the next action moves on to asking the operator why customs still holds it. _Simulate operator update_ then brings the customs release; before the upload, Transvolta reports the hold again. A message already received never changes: upload afterwards and simulate once more, and the release arrives as a new event.
   - SHP-1003: stale, no update for 4 days → _contact operator_. It is shown as "Unconfirmed", never "On time".
   - SHP-1016: its leg is 2 hours overdue and the operator gave no revised ETA, so the estimate is a day with a range at _medium_ confidence, not a time of day.
   - SHP-1014: undocumented operator code, shown as "Unrecognised update" instead of being guessed. The AI suggests a likely meaning (_Umladung_ = transshipment) without applying it, the ETA drops to medium confidence and ops is asked to check it with the operator.
6. **Switch "Viewing as" to Claire (Solenne Équipements).** She sees only her own shipments, proactive notices, and the delivery window exactly as the courier sent it (_Today, 09:00–11:00 CEST · Confirmed_) with a map of the positions the courier reported for the parcel out for delivery. Switch to Diego (Oskendra México): the port-delay warning for PO-12402 appears only after ops has sent it.
7. **Switch to Tomáš (Brno).** Same dashboard, limited to one site's perimeter.

## How it is built

- **Next.js App Router, Server Components by default.** Demo state (active user, applied updates, completed actions) lives in three cookies changed by Server Actions. Search and filters are URL params. Client JS is limited to the switchers and filters, the pending buttons, the live refresh, the error page and the map (react-leaflet, loaded with `ssr: false`).
- **`src/domain`: deterministic rules.**
  - Each operator's raw feed is validated with Zod and normalized through its own code map.
  - Unknown codes become `unknown`, and malformed messages are kept aside.
  - The layer also builds the unified timeline, detects stale data and filters by role perimeter.
- **`src/ai`: everything "AI"**, behind the `AiService` interface (risk, ETA, next action, daily summary, query parsing and answering, customer notice, suggested reading of unknown operator codes). The mock is pure functions, and every output is validated against Zod schemas, as a real model's output would be. `src/ai/index.ts` is the single swap point.
- **`src/data`: synthetic data.** Four fictional operators with deliberately different formats (numeric codes, free text, port events with UN/LOCODEs, German short codes), three sites, seven customers and 20 shipments.
- **Reliability rule.** Stored data is only what operators reported. Every ETA and milestone is labelled **Confirmed** (the operator said so) or **Estimated** (we computed it), and estimates always carry a confidence level.

## Freshness in production

In the prototype, updates arrive through "Simulate operator update", and the ops view re-fetches its server data on an interval (`router.refresh()`), without touching the demo clock. Stale data is flagged per mode ("No update for 4 days"), never shown as on time.

In production, each operator feed arrives by webhook where the operator offers one, or by polling otherwise, into a queue. A worker validates each message with the same per-operator Zod schema, normalizes it, stores the raw event, and revalidates only the views of the affected shipment. When the recomputed risk crosses a threshold, it enters the ops exception queue (notified in-app, or by email or chat for high risk), and customer notices are drafted for ops to send, as in the demo.

## Known limitations

- Import customs in Mexico is not modelled: the sea shipments go from the port straight to last-mile delivery, and their ETA has no customs allowance.
- Every time is shown in Madrid time (labelled CEST/CET). Showing each viewer their own zone is the next step.
- Documents are not stored: every available document opens the same synthetic placeholder PDF.
- The clock is fixed at the demo time, and operator updates arrive only through "Simulate operator update".
