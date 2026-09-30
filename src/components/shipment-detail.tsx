import Link from "next/link";
import { ArrowLeft, CircleCheck, FileText, Radio, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { ai } from "@/ai";
import type { ShipmentFacts } from "@/ai/query";
import type { EtaPrediction, MappingSuggestion } from "@/ai/types";
import { simulateUpdate } from "@/app/actions";
import { doneKey, noticeForCustomer } from "@/app/demo";
import { customerOf, SIMULATED_UPDATES, siteOf } from "@/data";
import { OPERATORS } from "@/domain/operators";
import { hoursSinceUpdate, lastMilestone, unifiedTimeline } from "@/domain/timeline";
import { DOCUMENT_LABELS, type Leg, type Milestone, type TrackedShipment } from "@/domain/types";
import { DEMO_NOW, formatAgo, formatDateTime } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "./client-controls";
import { DeliveryMap } from "./delivery-map-loader";
import {
  ACTION_ICON, ActionControl, AiTag, ConfidenceMeter, DelayNote, etaText, MODE_ICON, ModeTrail, Pill, ReliabilityBadge, RiskBadge, StaleBadge, STATUS, StatusBadge,
} from "./shipment-bits";

type Variant = "ops" | "customer";

// --- Timeline -----------------------------------------------------------------

function LegHeader({ leg, variant }: { leg: Leg; variant: Variant }) {
  const Icon = MODE_ICON[leg.mode];
  return (
    <li className="relative pb-3 pl-8">
      <span className="absolute top-0.5 left-0 grid size-5 place-items-center rounded-md bg-slate-100 text-slate-600">
        <Icon className="size-3.5" />
      </span>
      <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {leg.mode === "sea" ? "Sea" : "Road"} · {leg.from.name} → {leg.to.name}
      </div>
      {variant === "ops" && (
        <div className="text-xs text-muted-foreground">
          {OPERATORS[leg.operatorId].name} · ref <span className="font-mono">{leg.operatorRef}</span>
        </div>
      )}
    </li>
  );
}

/** Solid dot = happened. Hollow dot = still to come (dashed when it is only our estimate). */
function TimelineItem({
  m,
  title,
  sub,
  upcoming = false,
  children,
}: {
  m: Pick<Milestone, "reliability" | "at">;
  title: string;
  sub?: React.ReactNode;
  upcoming?: boolean;
  children?: React.ReactNode;
}) {
  const estimated = m.reliability === "estimated";
  return (
    <li className="relative pb-5 pl-8">
      <span
        className={cn(
          "absolute top-1 left-1.5 size-2.5 rounded-full",
          estimated ? "border-2 border-dashed border-slate-400 bg-white" : upcoming ? "border-2 border-slate-900 bg-white" : "bg-slate-900",
        )}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("text-sm font-medium", estimated && "text-muted-foreground")}>{title}</span>
        {(estimated || upcoming) && <ReliabilityBadge reliability={m.reliability} />}
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      {children}
    </li>
  );
}

/** Ops traceability: which operator said it, exactly how, and the ETA they gave. */
function OperatorTrace({ m }: { m: Milestone }) {
  return (
    <>
      {" · "}
      {OPERATORS[m.operatorId].name}
      <span
        className={cn("ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600", m.status === "unknown" && "bg-amber-100 text-amber-900")}
        title="Exactly what the operator sent, before normalization"
      >
        {m.rawStatus}
      </span>
      {m.eta && ` · operator ETA ${formatDateTime(m.eta.latest)}`}
    </>
  );
}

/** Consecutive reports of the same status on the same leg ("At sea" x3) become one step. Unknown codes never merge. */
function groupRepeats(items: Milestone[]): Milestone[][] {
  const groups: Milestone[][] = [];
  for (const m of items) {
    const group = groups.at(-1);
    const prev = group?.at(-1);
    const repeat = prev && prev.legId === m.legId && prev.status === m.status && m.status !== "unknown" && prev.reliability === "confirmed" && m.reliability === "confirmed";
    if (repeat) group!.push(m);
    else groups.push([m]);
  }
  return groups;
}

export function Timeline({
  shipment,
  eta,
  variant,
  suggestions = {},
}: {
  shipment: TrackedShipment;
  eta: EtaPrediction;
  variant: Variant;
  suggestions?: Record<string, MappingSuggestion>; // by milestone id
}) {
  let items = unifiedTimeline(shipment);
  if (variant === "customer") {
    // Customers get the story, not the plumbing: no unrecognised codes, no repeated statuses.
    items = items.filter((m, i, all) => m.status !== "unknown" && m.status !== all[i - 1]?.status);
  }
  const groups = groupRepeats(items);
  const delivered = shipment.milestones.some((m) => m.status === "delivered" && m.legId === shipment.legs.at(-1)!.id);
  const legOf = (m: Milestone) => shipment.legs.find((l) => l.id === m.legId)!;

  return (
    <ol className="relative before:absolute before:top-2 before:bottom-6 before:left-[10px] before:w-px before:bg-slate-200">
      {groups.map((group, i) => {
        const m = group.at(-1)!; // the latest report carries the freshest details
        const earlier = group.slice(0, -1);
        const leg = legOf(m);
        const newLeg = i === 0 || groups[i - 1][0].legId !== m.legId;
        const planned = m.reliability === "estimated";
        const suggestion = suggestions[m.id];
        return (
          <FragmentWithLeg key={m.id} leg={newLeg && shipment.legs.length > 1 ? leg : undefined} variant={variant}>
            <TimelineItem
              m={m}
              title={planned ? `${leg.mode === "sea" ? "Vessel departure" : "Pickup"} planned` : STATUS[m.status].label}
              sub={
                <>
                  {planned
                    ? m.at < DEMO_NOW.toISOString()
                      ? `Was planned for ${formatDateTime(m.at)}; waiting for the previous leg`
                      : `Planned for ${formatDateTime(m.at)} from ${leg.from.name}`
                    : formatDateTime(m.at)}
                  {!planned && m.location && ` · ${m.location}`}
                  {variant === "ops" && !planned && <OperatorTrace m={m} />}
                </>
              }
            >
              {variant === "ops" && earlier.length > 0 && (
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    {earlier.length} earlier {earlier.length === 1 ? "update" : "updates"} with the same status
                  </summary>
                  <ul className="mt-1 space-y-1 border-l pl-3">
                    {earlier.map((e) => (
                      <li key={e.id}>
                        {formatDateTime(e.at)}
                        {e.location && ` · ${e.location}`}
                        <OperatorTrace m={e} />
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {variant === "ops" && suggestion && (
                <div className="mt-1.5 flex gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-2 text-xs text-slate-700" data-testid="mapping-suggestion">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-600" />
                  <span>
                    <span className="font-medium">Likely meaning: </span>
                    {suggestion.meaning} → {STATUS[suggestion.status].label} ({suggestion.confidence} confidence). Not applied until{" "}
                    {OPERATORS[m.operatorId].name} confirms it.
                  </span>
                </div>
              )}
            </TimelineItem>
          </FragmentWithLeg>
        );
      })}
      {!delivered && (
        <TimelineItem
          upcoming
          m={{ reliability: eta.reliability, at: eta.expected }}
          title={`Delivery to ${customerOf(shipment).place.name}`}
          sub={[etaText(eta, false).main, etaText(eta, false).sub].filter(Boolean).join(" · ")}
        />
      )}
    </ol>
  );
}

function FragmentWithLeg({ leg, variant, children }: { leg?: Leg; variant: Variant; children: React.ReactNode }) {
  return (
    <>
      {leg && <LegHeader leg={leg} variant={variant} />}
      {children}
    </>
  );
}

// --- Cards --------------------------------------------------------------------

export function EtaCard({ facts, variant }: { facts: ShipmentFacts; variant: Variant }) {
  const { eta, status, shipment } = facts;
  const delivered = status === "delivered";
  const t = etaText(eta, delivered);
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {delivered ? "Delivered" : eta.reliability === "confirmed" ? "Delivery window" : "Estimated delivery"}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold tracking-tight" data-testid="eta-main">
            {t.main}
          </span>
          {t.sub && <span className="text-sm text-muted-foreground">{t.sub}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ReliabilityBadge reliability={eta.reliability} />
          {eta.reliability === "estimated" && <ConfidenceMeter confidence={eta.confidence} />}
          {!delivered && <DelayNote eta={eta} stale={facts.stale} />}
          <span className="text-xs text-muted-foreground">Promised {formatDateTime(shipment.promisedDelivery)}</span>
        </div>
        {variant === "ops" && (
          <p className="flex gap-2 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" />
            <span>
              <span className="font-medium">Why this ETA: </span>
              {eta.explanation}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentsCard({ shipment, variant }: { shipment: TrackedShipment; variant: Variant }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Documents</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {shipment.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <FileText className={cn("size-4 shrink-0", d.status === "missing" ? "text-red-600" : "text-muted-foreground")} />
              <span className={cn("flex-1", d.status === "missing" && "text-muted-foreground")}>{DOCUMENT_LABELS[d.kind]}</span>
              {d.status === "missing" ? (
                <Pill tone={variant === "ops" ? "red" : "neutral"}>{variant === "ops" ? "Missing" : "Pending"}</Pill>
              ) : (
                <span className="text-xs text-muted-foreground">PDF</span>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SimulateCard({ shipment, applied }: { shipment: TrackedShipment; applied: boolean }) {
  if (!SIMULATED_UPDATES[shipment.id]) return null;
  const operator = OPERATORS[SIMULATED_UPDATES[shipment.id].operatorId].name;
  return (
    <Card size="sm" className="border border-dashed border-slate-300 bg-transparent ring-0">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Radio className="size-3.5" /> Demo control
        </div>
        {applied ? (
          <p className="text-sm text-muted-foreground">{operator} sent its update. ETA, risk and notices were recalculated. Use “Reset demo” in the header to replay it.</p>
        ) : (
          <form action={simulateUpdate} className="space-y-2">
            <p className="text-sm text-muted-foreground">Inject the next message from {operator}, as it would arrive from their feed.</p>
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <SubmitButton pendingText="Receiving update…" className="w-full justify-center bg-slate-900 text-white hover:bg-slate-800">
              <RefreshCw /> Simulate operator update
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function MapCard({ shipment }: { shipment: TrackedShipment }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Live delivery route</CardTitle>
      </CardHeader>
      <CardContent>
        <DeliveryMap positions={shipment.positions!} destination={customerOf(shipment).place} />
        <p className="mt-2 text-xs text-muted-foreground">Last driver position {formatDateTime(shipment.positions!.at(-1)!.at)}. Shown only while out for delivery.</p>
      </CardContent>
    </Card>
  );
}

// --- Pages --------------------------------------------------------------------

function Header({ facts, variant }: { facts: ShipmentFacts; variant: Variant }) {
  const s = facts.shipment;
  const last = lastMilestone(s);
  const source = variant === "ops" && last ? `update from ${OPERATORS[last.operatorId].name}` : "carrier update";
  return (
    <div className="space-y-3">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {variant === "ops" ? "Back to dashboard" : "Your shipments"}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{variant === "ops" ? s.reference : `Order ${s.orderRef}`}</h1>
        <StatusBadge status={facts.status} />
        {facts.stale && <StaleBadge hours={hoursSinceUpdate(s) ?? 0} />}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {variant === "ops" ? `${s.orderRef} · ${customerOf(s).name}` : `Shipment ${s.reference}`}
        <span>·</span>
        {siteOf(s).name} → {customerOf(s).place.name} ({customerOf(s).place.country})
        <ModeTrail legs={s.legs} />
      </p>
      {/* Freshness is always visible: how old is what we are showing? */}
      <p className="text-xs text-muted-foreground" data-testid="freshness">
        {last ? `Last ${source}: ${formatDateTime(last.at)} (${formatAgo(hoursSinceUpdate(s) ?? 0)})` : "No update from the carrier yet"}
      </p>
    </div>
  );
}

export async function OpsShipmentDetail({ facts, applied, done }: { facts: ShipmentFacts; applied: boolean; done: string[] }) {
  const s = facts.shipment;
  const [action, notice, suggestions] = await Promise.all([
    ai.suggestNextAction(s, facts.risk),
    ai.customerNotice(s, facts.eta),
    Promise.all(s.milestones.map(async (m) => [m.id, await ai.suggestMapping(m)] as const)),
  ]);
  const Icon = ACTION_ICON[action.kind];
  const noticeSent = done.includes(doneKey(s.id, "notify_customer"));
  const outForDelivery = facts.status === "out_for_delivery" && s.positions;

  return (
    <div className="space-y-6">
      <Header facts={facts} variant="ops" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <EtaCard facts={facts} variant="ops" />
          {outForDelivery && <MapCard shipment={s} />}
          <Card>
            <CardHeader>
              <CardTitle>Unified timeline</CardTitle>
              <p className="text-xs text-muted-foreground">
                {new Set(s.legs.map((l) => l.operatorId)).size} operator feed(s) merged. Grey tags show the raw operator status behind each normalized step.
              </p>
            </CardHeader>
            <CardContent>
              <Timeline
                shipment={s}
                eta={facts.eta}
                variant="ops"
                suggestions={Object.fromEntries(suggestions.filter((e): e is readonly [string, MappingSuggestion] => e[1] !== null))}
              />
              {s.invalidEvents.length > 0 && (
                <p className="mt-2 flex items-center gap-2 text-xs text-amber-800">
                  <TriangleAlert className="size-4" /> {s.invalidEvents.length} operator message(s) could not be read and were not used.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="ring-violet-200">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Risk assessment <AiTag />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RiskBadge risk={facts.risk} />
              {facts.risk.reasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700">
                  {facts.risk.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No risk factors detected.</p>
              )}
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3" data-testid="next-action">
                <div className="mb-1 text-xs font-medium tracking-wide text-violet-800 uppercase">Proposed next action</div>
                <div className="flex gap-2 font-medium">
                  <Icon className="mt-0.5 size-4 shrink-0 text-violet-700" /> {action.label}
                </div>
                {action.rationale && <p className="mt-1 text-sm text-slate-700">{action.rationale}</p>}
                <div className="mt-3">
                  <ActionControl shipmentId={s.id} action={action} done={done.includes(doneKey(s.id, action.kind))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                What the customer sees{" "}
                {notice?.severity === "warning" && noticeSent ? (
                  <Pill tone="green">
                    <CircleCheck /> Sent
                  </Pill>
                ) : (
                  <AiTag label={notice?.severity === "info" ? "Automatic" : "Drafted"} />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notice ? (
                <div className="space-y-2" data-testid="customer-view">
                  <div className={cn("rounded-md border p-3 text-sm", notice.severity === "warning" ? "border-amber-200 bg-amber-50" : "bg-slate-50")}>
                    <div className="font-medium">{notice.title}</div>
                    <p className="mt-1 text-slate-700">{notice.body}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    {notice.severity === "info" ? "Informational: shown to the customer automatically" : noticeSent ? "Sent · visible to the customer" : "Not visible to the customer yet"}
                    {/* A warning can be sent from here too when the proposed action is something else (e.g. a customs hold). */}
                    {notice.severity === "warning" && !noticeSent && action.kind !== "notify_customer" && (
                      <ActionControl shipmentId={s.id} action={{ kind: "notify_customer", label: "Send notice", rationale: "" }} done={false} compact />
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No proactive notice: nothing the customer needs to know right now.</p>
              )}
            </CardContent>
          </Card>

          <DocumentsCard shipment={s} variant="ops" />
          <SimulateCard shipment={s} applied={applied} />
        </div>
      </div>
    </div>
  );
}

export async function CustomerShipmentDetail({ facts, applied, done }: { facts: ShipmentFacts; applied: boolean; done: string[] }) {
  const s = facts.shipment;
  const notice = noticeForCustomer(await ai.customerNotice(s, facts.eta), s.id, done);
  const outForDelivery = facts.status === "out_for_delivery" && s.positions;

  return (
    <div className="space-y-6">
      <Header facts={facts} variant="customer" />
      {notice && <NoticeBanner notice={notice} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <EtaCard facts={facts} variant="customer" />
          {outForDelivery && <MapCard shipment={s} />}
          <Card>
            <CardHeader>
              <CardTitle>Journey</CardTitle>
            </CardHeader>
            <CardContent>
              <Timeline shipment={s} eta={facts.eta} variant="customer" />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <DocumentsCard shipment={s} variant="customer" />
          <SimulateCard shipment={s} applied={applied} />
        </div>
      </div>
    </div>
  );
}

export function NoticeBanner({ notice, href }: { notice: { title: string; body: string; severity: "info" | "warning" }; href?: string }) {
  const body = (
    <div
      className={cn("flex gap-3 rounded-xl border p-4", notice.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50")}
      data-testid="customer-notice"
    >
      {notice.severity === "warning" ? <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" /> : <Sparkles className="mt-0.5 size-5 shrink-0 text-sky-700" />}
      <div>
        <div className="font-medium">{notice.title}</div>
        <p className="text-sm text-slate-700">{notice.body}</p>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition-opacity hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}
