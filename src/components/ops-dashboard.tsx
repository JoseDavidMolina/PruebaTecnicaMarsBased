import Link from "next/link";
import { Search, Sparkles, X } from "lucide-react";
import { ai } from "@/ai";
import { matchQuery, type ShipmentFacts } from "@/ai/query";
import { doneKey, loadFacts } from "@/app/demo";
import { customerOf, SITES, siteOf } from "@/data";
import { OPERATORS } from "@/domain/operators";
import { hoursSinceUpdate } from "@/domain/timeline";
import type { OperatorId, TrackedShipment, User } from "@/domain/types";
import { DEMO_NOW, formatLongDate, formatTime } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AutoSubmitSelect } from "./client-controls";
import { ACTION_ICON, ActionControl, AiTag, EtaCell, ModeTrail, Pill, RiskBadge, StaleBadge, StatusBadge } from "./shipment-bits";

export type DashboardParams = { q?: string; site?: string; op?: string; view?: string };

const EXAMPLES = ["shipments to France this week running late", "what's going on with order 12345?", "sea shipments delayed at port", "Alpenweg shipments from Brno"];

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
  const [facts, summary, query] = await Promise.all([
    Promise.all(shipments.map(loadFacts)),
    ai.summarizeDay(shipments),
    params.q ? ai.parseQuery(params.q) : null,
  ]);

  const filtered = facts
    .filter((f) => !params.site || f.shipment.originSiteId === params.site)
    .filter((f) => !params.op || f.shipment.legs.some((l) => l.operatorId === params.op));
  const actions = new Map(await Promise.all(filtered.map(async (f) => [f.shipment.id, await ai.suggestNextAction(f.shipment, f.risk)] as const)));
  const handled = (f: ShipmentFacts) => done.includes(doneKey(f.shipment.id, actions.get(f.shipment.id)!.kind));
  // Managing by exception: once ops has acted on the proposed action, the shipment leaves the queue until something new happens.
  const atRisk = filtered.filter((f) => f.risk.level !== "low");
  const attention = atRisk.filter((f) => !handled(f));
  const handledCount = atRisk.length - attention.length;
  const view = query ? "search" : params.view === "all" ? "all" : "attention";
  const matches = query ? filtered.filter((f) => matchQuery(query, f)) : [];
  const rows = (query ? matches : view === "all" ? filtered : attention).sort(
    (a, b) => b.risk.score - a.risk.score || a.eta.expected.localeCompare(b.eta.expected),
  );
  const answer = query ? await ai.answerQuery(query, matches) : null;

  const sites = SITES.filter((s) => user.siteIds.includes(s.id));
  const operatorIds = [...new Set(shipments.flatMap((s) => s.legs.map((l) => l.operatorId)))] as OperatorId[];
  const c = summary.counts;
  const kpis = [
    { label: "At risk", value: c.atRisk, href: href({ site: params.site, op: params.op }), tone: "text-red-700" },
    { label: "Held at customs", value: c.customsHold, href: href({ q: "held at customs" }) },
    { label: "Delayed at port", value: c.portDelay, href: href({ q: "delayed at port" }) },
    { label: "No recent update", value: c.stale, href: href({ q: "stale" }) },
    { label: "Incidents", value: c.exceptions, href: href({ q: "incident" }) },
    { label: "Out for delivery", value: c.outForDelivery, href: href({ q: "out for delivery" }) },
    { label: "Delivered today", value: c.deliveredToday, href: href({ q: "delivered today" }) },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Good morning, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {formatLongDate(DEMO_NOW.toISOString())} · {shipments.length} active and recent shipments from {new Intl.ListFormat("en").format(sites.map((s) => s.name))}
        </p>
      </div>

      <Card className="border-violet-200 bg-gradient-to-br from-violet-50/80 to-white ring-violet-200">
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AiTag label="Daily briefing" /> generated at {formatTime(DEMO_NOW.toISOString())} from the latest operator updates
          </div>
          <p className="text-lg leading-snug font-medium text-balance" data-testid="daily-summary">
            {summary.headline}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {kpis.map((k) => (
              <Link key={k.label} href={k.href} className="rounded-lg border bg-white px-3 py-2 transition-colors hover:border-violet-300 hover:bg-violet-50/50">
                <div className={cn("text-xl font-semibold tabular-nums", k.value === 0 ? "text-muted-foreground" : k.tone)}>{k.value}</div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <form action="/" className="flex flex-wrap gap-2">
            <div className="relative min-w-72 flex-1">
              <Sparkles className="pointer-events-none absolute top-2.5 left-3 size-4 text-violet-600" />
              <input
                name="q"
                defaultValue={params.q}
                aria-label="Ask about your shipments"
                placeholder="Ask about your shipments, e.g. “shipments to France this week running late”"
                className="h-9 w-full rounded-md border border-input bg-background pr-3 pl-9 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-violet-300"
              />
            </div>
            <AutoSubmitSelect name="site" defaultValue={params.site ?? ""} aria-label="Origin site">
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </AutoSubmitSelect>
            <AutoSubmitSelect name="op" defaultValue={params.op ?? ""} aria-label="Operator">
              <option value="">All operators</option>
              {operatorIds.map((id) => (
                <option key={id} value={id}>{OPERATORS[id].name}</option>
              ))}
            </AutoSubmitSelect>
            <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800">
              <Search className="size-4" /> Search
            </button>
          </form>

          {query ? (
            <div className="flex flex-wrap items-center gap-1.5 text-sm" data-testid="query-interpretation">
              <span className="text-muted-foreground">Understood as</span>
              {query.interpretedAs.length ? query.interpretedAs.map((chip) => <Pill key={chip} tone="violet">{chip}</Pill>) : <Pill>nothing specific</Pill>}
              {query.unparsed.length > 0 && (
                <Pill tone="amber" title="Words the assistant did not use to filter">
                  Ignored: {query.unparsed.join(", ")}
                </Pill>
              )}
              <Link href={href({ site: params.site, op: params.op })} className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <X className="size-3" /> Clear
              </Link>
            </div>
          ) : null}
          {answer && (
            <div className="flex gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm" data-testid="query-answer">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" />
              <div className="space-y-1">
                <p className="text-slate-800">{answer.text}</p>
                {answer.shipmentId && (
                  <Link href={`/shipments/${answer.shipmentId}`} className="text-xs font-medium text-violet-800 hover:underline">
                    Open shipment →
                  </Link>
                )}
              </div>
            </div>
          )}
          {!query && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Try:
              {EXAMPLES.map((e) => (
                <Link key={e} href={href({ q: e })} className="rounded-full border px-2 py-0.5 hover:border-violet-300 hover:text-foreground">
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
            <span className="-mb-px border-b-2 border-slate-900 pb-2 font-medium">Search results ({rows.length})</span>
          ) : (
            <>
              <Link href={href({ site: params.site, op: params.op })} className={cn("-mb-px pb-2", view === "attention" ? "border-b-2 border-slate-900 font-medium" : "text-muted-foreground")}>
                Needs attention ({attention.length})
              </Link>
              {handledCount > 0 && (
                <span className="-mb-px pb-2 text-xs text-emerald-700" data-testid="handled-count">
                  {handledCount} handled today
                </span>
              )}
              <Link href={href({ site: params.site, op: params.op, view: "all" })} className={cn("-mb-px pb-2", view === "all" ? "border-b-2 border-slate-900 font-medium" : "text-muted-foreground")}>
                All shipments ({filtered.length})
              </Link>
            </>
          )}
          <span className="ml-auto pb-2 text-xs text-muted-foreground">Sorted by AI risk score</span>
        </div>

        <Card className="py-0">
          <Table>
            <TableHeader>
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
            <TableBody>
              {rows.map((f) => {
                const s = f.shipment;
                const action = actions.get(s.id)!;
                const Icon = ACTION_ICON[action.kind];
                return (
                  <TableRow key={s.id} className="align-top" data-testid={`row-${s.id}`}>
                    <TableCell className="pl-4">
                      <RiskBadge risk={f.risk} />
                    </TableCell>
                    <TableCell>
                      <Link href={`/shipments/${s.id}`} className="font-medium underline-offset-2 hover:underline">
                        {s.reference}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {s.orderRef} · {customerOf(s).name}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 text-sm whitespace-normal">
                      <div>
                        {siteOf(s).place.name} → {customerOf(s).place.name}
                      </div>
                      <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                        <ModeTrail legs={s.legs} />
                        <div>{[...new Set(s.legs.map((l) => OPERATORS[l.operatorId].name))].join(", ")}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={f.status} />
                        {f.stale && <StaleBadge hours={hoursSinceUpdate(s) ?? 0} />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <EtaCell eta={f.eta} delivered={f.status === "delivered"} stale={f.stale} />
                    </TableCell>
                    <TableCell className="max-w-52 pr-4 whitespace-normal">
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
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {view !== "attention" ? "No shipments match." : handledCount ? "Nothing left to act on: every shipment at risk has been handled." : "Nothing needs attention. Every shipment is on track."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
