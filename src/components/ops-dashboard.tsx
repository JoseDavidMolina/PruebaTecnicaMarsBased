import Link from "next/link";
import { Search, Sparkles, X } from "lucide-react";
import { ai } from "@/ai";
import { matchQuery, type ShipmentFacts } from "@/ai/query";
import { doneKey, loadFacts } from "@/app/demo";
import { customerOf, SITES, siteOf } from "@/data";
import { OPERATORS } from "@/domain/operators";
import { hoursSinceUpdate } from "@/domain/timeline";
import type { OperatorId, TrackedShipment, User } from "@/domain/types";
import { DEMO_NOW, formatLongDate, formatTime, zoneName } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AutoSubmitSelect } from "./client-controls";
import { ACTION_ICON, ActionControl, AiTag, EtaCell, JourneyLine, Pill, RiskBadge, StaleBadge, StatusBadge } from "./shipment-bits";

export type DashboardParams = { q?: string; site?: string; op?: string; view?: string };

const EXAMPLES = [
  "shipments to France this week running late",
  "what's going on with order 12345?",
  "sea shipments delayed at port",
  "Alpenweg shipments from Brno",
];

const tabClass = (active: boolean) => cn("-mb-px pb-2", active ? "border-b-2 border-primary font-medium" : "text-muted-foreground");

const href = (params: DashboardParams) => {
  const qs = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
  return qs.size ? `/?${qs}` : "/";
};

export async function OpsDashboard({
  user,
  shipments,
  params,
  done,
}: {
  user: Extract<User, { role: "ops" }>;
  shipments: TrackedShipment[];
  params: DashboardParams;
  done: string[];
}) {
  const [facts, query] = await Promise.all([Promise.all(shipments.map(loadFacts)), params.q ? ai.parseQuery(params.q) : null]);

  const filtered = facts
    .filter((f) => !params.site || f.shipment.originSiteId === params.site)
    .filter((f) => !params.op || f.shipment.legs.some((l) => l.operatorId === params.op));
  const actions = new Map(
    await Promise.all(filtered.map(async (f) => [f.shipment.id, await ai.suggestNextAction(f.shipment, f.risk)] as const)),
  );
  const handled = (f: ShipmentFacts) => done.includes(doneKey(f.shipment.id, actions.get(f.shipment.id)!.kind));
  // Managing by exception: once ops has acted on the proposed action, the shipment leaves the queue until something new happens.
  const atRisk = filtered.filter((f) => f.risk.level !== "low");
  const attention = atRisk.filter((f) => !handled(f));
  const handledCount = atRisk.length - attention.length;
  // The briefing describes what the filters show, so its counts match the queue and the KPI drill-downs.
  const summary = await ai.summarizeDay(
    filtered.map((f) => f.shipment),
    atRisk.filter(handled).map((f) => f.shipment.id),
  );
  const view = query ? "search" : params.view === "all" ? "all" : "attention";
  const matches = query ? filtered.filter((f) => matchQuery(query, f)) : [];
  const rows = (query ? matches : view === "all" ? filtered : attention).sort(
    (a, b) => b.risk.score - a.risk.score || a.eta.expected.localeCompare(b.eta.expected),
  );
  const answer = query ? await ai.answerQuery(query, matches) : null;

  const sites = SITES.filter((s) => user.siteIds.includes(s.id));
  const operatorIds = [...new Set(shipments.flatMap((s) => s.legs.map((l) => l.operatorId)))] as OperatorId[];
  const scope = [sites.find((s) => s.id === params.site)?.name, OPERATORS[params.op as OperatorId]?.name].filter(Boolean);
  const c = summary.counts;
  const allHref = href({ site: params.site, op: params.op, view: "all" });
  // An empty list says what happened and offers the way out, instead of an empty table.
  const empty = query
    ? { text: "No shipments match this search.", link: "Clear the search", href: href({ site: params.site, op: params.op }) }
    : view === "all"
      ? { text: "No shipments match these filters.", link: "Show every site and operator", href: href({ view: "all" }) }
      : handledCount
        ? { text: `Nothing left to act on: ${handledCount} handled today.`, link: "See all shipments", href: allHref }
        : { text: "Nothing needs attention: every shipment is on track.", link: "See all shipments", href: allHref };
  // Every KPI keeps the current filters, so its drill-down shows the same number.
  const scoped = (q?: string) => href({ q, site: params.site, op: params.op });
  // The first chip counts what is still open, so it always matches the queue it opens (handled cases leave it).
  const kpis = [
    { label: "Need attention", value: attention.length, href: scoped(), tone: "text-red-700" },
    { label: "Held at customs", value: c.customsHold, href: scoped("held at customs") },
    { label: "Delayed at port", value: c.portDelay, href: scoped("delayed at port") },
    { label: "No recent update", value: c.stale, href: scoped("stale") },
    { label: "Incidents", value: c.exceptions, href: scoped("incident") },
    { label: "Out for delivery", value: c.outForDelivery, href: scoped("out for delivery") },
    { label: "Delivered today", value: c.deliveredToday, href: scoped("delivered today") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-base font-semibold">Good morning, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {formatLongDate(DEMO_NOW.toISOString())}, {shipments.length} active and recent shipments from{" "}
          {new Intl.ListFormat("en").format(sites.map((s) => s.name))}
        </p>
      </div>

      <Card className="ring-violet-200">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <AiTag label="Daily briefing" /> generated at {formatTime(DEMO_NOW.toISOString())} {zoneName()} from the latest operator updates
            {scope.length > 0 && <span className="font-medium text-foreground">· {scope.join(" · ")} only</span>}
          </div>
          <p className="max-w-[60ch] text-xl leading-snug font-medium text-balance sm:text-2xl" data-testid="daily-summary">
            {summary.headline}
          </p>
          <div className="flex flex-wrap gap-2">
            {kpis.map((k) => (
              <Link
                key={k.label}
                href={k.href}
                className="inline-flex h-8 items-baseline gap-1.5 rounded-full border bg-card px-3 pt-1.5 text-sm transition-colors hover:border-foreground/30 hover:bg-muted"
              >
                <span className={cn("font-semibold tabular-nums", k.value === 0 ? "text-muted-foreground" : k.tone)}>{k.value}</span>
                <span className="text-muted-foreground">{k.label}</span>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <form action="/" className="flex flex-wrap gap-2">
            <div className="relative basis-full sm:min-w-72 sm:flex-1 sm:basis-auto">
              <Sparkles className="pointer-events-none absolute top-2.5 left-3 size-4 text-violet-600" />
              <input
                name="q"
                defaultValue={params.q}
                aria-label="Ask about your shipments"
                placeholder="Ask about your shipments…"
                className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm"
              />
            </div>
            <AutoSubmitSelect
              name="site"
              defaultValue={params.site ?? ""}
              aria-label="Origin site"
              className="min-w-0 flex-1 sm:flex-initial"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </AutoSubmitSelect>
            <AutoSubmitSelect name="op" defaultValue={params.op ?? ""} aria-label="Operator" className="min-w-0 flex-1 sm:flex-initial">
              <option value="">All operators</option>
              {operatorIds.map((id) => (
                <option key={id} value={id}>
                  {OPERATORS[id].name}
                </option>
              ))}
            </AutoSubmitSelect>
            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Search className="size-4" /> Search
            </button>
          </form>

          {query ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="query-interpretation">
              <span className="text-muted-foreground">Understood as</span>
              {query.interpretedAs.length ? (
                query.interpretedAs.map((chip) => (
                  <Pill key={chip} tone="violet">
                    {chip}
                  </Pill>
                ))
              ) : (
                <Pill>nothing specific</Pill>
              )}
              {query.unparsed.length > 0 && (
                <Pill tone="amber" title="Words the assistant did not use to filter">
                  Ignored: {query.unparsed.join(", ")}
                </Pill>
              )}
              <Link href={scoped()} className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="size-3" /> Clear
              </Link>
            </div>
          ) : null}
          {answer && (
            <div className="flex gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm" data-testid="query-answer">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" />
              <div className="space-y-1">
                <p className="text-foreground">{answer.text}</p>
                {answer.shipmentId && (
                  <Link href={`/shipments/${answer.shipmentId}`} className="text-xs font-medium text-violet-800 hover:underline">
                    Open shipment
                  </Link>
                )}
              </div>
            </div>
          )}
          {!query && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Try:
              {EXAMPLES.map((e) => (
                <Link
                  key={e}
                  href={href({ q: e })}
                  className="rounded-full border px-2 py-0.5 hover:border-violet-300 hover:text-foreground"
                >
                  {e}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-4 border-b text-sm">
          {query ? (
            <span className="-mb-px border-b-2 border-primary pb-2 font-medium">Search results ({rows.length})</span>
          ) : (
            <>
              <Link href={scoped()} className={tabClass(view === "attention")} aria-current={view === "attention" ? "page" : undefined}>
                Needs attention ({attention.length})
              </Link>
              {handledCount > 0 && (
                <span className="-mb-px pb-2 text-xs text-emerald-700" data-testid="handled-count">
                  {handledCount} handled today
                </span>
              )}
              <Link href={allHref} className={tabClass(view === "all")} aria-current={view === "all" ? "page" : undefined}>
                All shipments ({filtered.length})
              </Link>
            </>
          )}
          <span className="ml-auto pb-2 text-xs text-muted-foreground">Sorted by AI risk score</span>
        </div>

        <Card className="py-0">
          {/* Below lg each row stacks (risk and shipment, route, status and ETA, action) in the same table DOM, so the
              proposed action is never off-screen behind a sideways scroll. */}
          {rows.length === 0 ? (
            <div className="space-y-2 px-4 py-10 text-center text-sm text-muted-foreground">
              <p>{empty.text}</p>
              <Link href={empty.href} className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                {empty.link}
              </Link>
            </div>
          ) : (
            <Table className="max-lg:block">
              <TableHeader className="max-lg:sr-only">
                <TableRow>
                  <TableHead className="pl-4">Risk</TableHead>
                  <TableHead>Shipment</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead className="pr-4">
                    Proposed action <Sparkles className="inline size-3 text-violet-600" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="max-lg:block">
                {rows.map((f) => {
                  const s = f.shipment;
                  const action = actions.get(s.id)!;
                  const Icon = ACTION_ICON[action.kind];
                  return (
                    <TableRow
                      key={s.id}
                      className="align-top max-lg:flex max-lg:flex-wrap max-lg:items-center max-lg:gap-x-3 max-lg:gap-y-3 max-lg:p-4"
                      data-testid={`row-${s.id}`}
                    >
                      <TableCell className="pl-4 max-lg:p-0">
                        <RiskBadge risk={f.risk} />
                      </TableCell>
                      <TableCell className="max-lg:min-w-0 max-lg:flex-1 max-lg:p-0">
                        <Link href={`/shipments/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                          {s.reference}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {s.orderRef} · {customerOf(s).name}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-64 text-sm whitespace-normal max-lg:max-w-none max-lg:basis-full max-lg:p-0">
                        <div>
                          {siteOf(s).place.name} → {customerOf(s).place.name}
                        </div>
                        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                          <JourneyLine shipment={s} stale={f.stale} />
                          <div>{[...new Set(s.legs.map((l) => OPERATORS[l.operatorId].name))].join(", ")}</div>
                        </div>
                      </TableCell>
                      <TableCell className="max-lg:p-0">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={f.status} />
                          {f.stale && <StaleBadge hours={hoursSinceUpdate(s) ?? 0} />}
                        </div>
                      </TableCell>
                      <TableCell className="max-lg:flex-1 max-lg:p-0">
                        <EtaCell eta={f.eta} delivered={f.status === "delivered"} stale={f.stale} />
                      </TableCell>
                      <TableCell className="max-w-52 pr-4 whitespace-normal max-lg:max-w-none max-lg:basis-full max-lg:p-0">
                        {action.kind === "none" ? (
                          <span className="flex gap-2 text-sm text-muted-foreground">
                            <Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" /> No action needed
                          </span>
                        ) : (
                          <div className="space-y-1.5">
                            <Link href={`/shipments/${s.id}`} className="group flex gap-2 text-sm">
                              <Icon className="mt-0.5 size-4 shrink-0 text-violet-600" />
                              <span className="group-hover:underline">{action.label}</span>
                            </Link>
                            <div className="pl-6">
                              <ActionControl shipmentId={s.id} action={action} done={handled(f)} compact />
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>
    </div>
  );
}
