import Link from "next/link";
import { ArrowLeft, CircleCheck, FileText, Info, Radio, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { ai } from "@/ai";
import type { ShipmentFacts } from "@/ai/query";
import type { EtaPrediction, MappingSuggestion } from "@/ai/types";
import { simulateUpdate } from "@/app/actions";
import { doneKey, noticeForCustomer } from "@/app/demo";
import { customerOf, nextOperatorMessage, operatorMessage, siteOf } from "@/data";
import { OPERATORS } from "@/domain/operators";
import { hoursSinceUpdate, lastMilestone, unifiedTimeline } from "@/domain/timeline";
import { DOCUMENT_LABELS, type Leg, type Milestone, type TrackedShipment } from "@/domain/types";
import { DEMO_NOW, formatAgo, formatDateTime, formatTime, zoneName } from "@/lib/clock";
import { etaText } from "@/lib/eta-display";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "./client-controls";
import { DeliveryMap } from "./delivery-map-loader";
import {
  ACTION_ICON,
  ActionControl,
  AiTag,
  ConfidenceMeter,
  DelayNote,
  MODE_ICON,
  JourneyLine,
  Pill,
  ReliabilityBadge,
  RiskBadge,
  StaleBadge,
  STATUS,
  StatusBadge,
} from "./shipment-bits";

type Variant = "ops" | "customer";

// --- Timeline -----------------------------------------------------------------

function LegHeader({ leg, variant }: { leg: Leg; variant: Variant }) {
  const Icon = MODE_ICON[leg.mode];
  return (
    <li className="relative pb-3 pl-8">
      <span className="absolute top-0.5 left-0 grid size-5 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="text-xs font-semibold text-muted-foreground">
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
          estimated
            ? "border-2 border-dashed border-muted-foreground bg-card"
            : upcoming
              ? "border-2 border-primary bg-card"
              : "bg-primary",
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
        className={cn(
          "ml-2 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground",
          m.status === "unknown" && "bg-amber-100 text-amber-900",
        )}
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
    const confirmed = prev?.reliability === "confirmed" && m.reliability === "confirmed";
    const repeat = prev && confirmed && prev.legId === m.legId && prev.status === m.status && m.status !== "unknown";
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
    <ol className="relative before:absolute before:top-2 before:bottom-6 before:left-[10px] before:w-px before:bg-border">
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
                <div
                  className="mt-1.5 flex gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-2 text-xs text-foreground"
                  data-testid="mapping-suggestion"
                >
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

/** Timeline rows show many times; one note labels them all instead of a zone on every row. */
const TimesNote = () => <>All times are Madrid time ({zoneName()}).</>;

// --- Cards --------------------------------------------------------------------

export function EtaCard({ facts, variant, className }: { facts: ShipmentFacts; variant: Variant; className?: string }) {
  const { eta, status, shipment } = facts;
  const delivered = status === "delivered";
  const t = etaText(eta, delivered);
  return (
    <Card className={className}>
      <CardContent className="space-y-3">
        <div className="text-xs font-semibold text-muted-foreground">
          {delivered ? "Delivered" : eta.reliability === "confirmed" ? "Delivery window" : "Estimated delivery"}
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-semibold tracking-tight tabular-nums" data-testid="eta-main">
            {delivered ? t.main.replace("Delivered ", "") : t.main}
          </span>
          {t.sub && <span className="text-sm text-muted-foreground">{t.sub}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ReliabilityBadge reliability={eta.reliability} />
          {eta.reliability === "estimated" && <ConfidenceMeter confidence={eta.confidence} />}
          {!delivered && <DelayNote eta={eta} stale={facts.stale} />}
          <span className="text-xs text-muted-foreground">
            Promised {formatDateTime(shipment.promisedDelivery)} {zoneName(shipment.promisedDelivery)}
          </span>
        </div>
        {/* A delivery is the operator's fact, not an estimate: nothing for the AI to explain. */}
        {variant === "ops" && !delivered && (
          <p className="flex gap-2 rounded-md bg-muted p-3 text-sm text-foreground">
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
                // Demo: every available document opens the same synthetic placeholder.
                <a
                  href="/demo-document.pdf"
                  target="_blank"
                  rel="noopener"
                  aria-label={`Open ${DOCUMENT_LABELS[d.kind]} (demo)`}
                  className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                >
                  PDF
                </a>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Offered while the operator has a further message to send; what it sends is decided when it is pressed. */
function SimulateCard({ shipment, received }: { shipment: TrackedShipment; received: string[] }) {
  const update = operatorMessage(shipment.id, "update");
  if (!update) return null;
  const operator = OPERATORS[update.operatorId].name;
  return (
    <Card size="sm" className="bg-muted/60 shadow-none">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Radio className="size-3.5" /> Demo control
        </div>
        {!nextOperatorMessage(shipment, received) ? (
          <p className="text-sm text-muted-foreground">
            {received.includes("update")
              ? `${operator} sent its update. ETA, risk and notices were recalculated. Use “Reset demo” in the header to replay it.`
              : `${operator} reported the hold again. Customs releases it only once the missing documents are uploaded; its next update comes after that.`}
          </p>
        ) : (
          <form action={simulateUpdate} className="space-y-2">
            <p className="text-sm text-muted-foreground">Inject the next message from {operator}, as it would arrive from their feed.</p>
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <SubmitButton pendingText="Receiving update…" className="w-full justify-center border border-input bg-card hover:bg-muted">
              <RefreshCw /> Simulate operator update
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

/** Positions are what the courier reported, not a live feed: the card says who reported them and when. */
function MapCard({ shipment }: { shipment: TrackedShipment }) {
  const last = shipment.positions!.at(-1)!;
  const operator = OPERATORS[shipment.legs.at(-1)!.operatorId].name;
  const reportedAt = `${formatDateTime(last.at)} ${zoneName(last.at)}`;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Delivery route <ReliabilityBadge reliability="confirmed" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <DeliveryMap
          positions={shipment.positions!}
          destination={customerOf(shipment).place}
          lastLabel={`Reported ${formatTime(last.at)}`}
        />
        <p className="mt-2 text-xs text-muted-foreground" data-testid="map-source">
          Reported by {operator} at {reportedAt}. Shown only while out for delivery.
        </p>
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
        <span className="max-sm:hidden">·</span>
        {siteOf(s).name} → {customerOf(s).place.name} ({customerOf(s).place.country})
      </p>
      <div className="max-w-3xl pt-1">
        <JourneyLine shipment={s} stale={facts.stale} size="full" />
      </div>
      {/* Freshness is always visible: how old is what we are showing? */}
      <p className="text-xs text-muted-foreground" data-testid="freshness">
        {last
          ? `Last ${source}: ${formatDateTime(last.at)} ${zoneName(last.at)} (${formatAgo(hoursSinceUpdate(s) ?? 0)})`
          : "No update from the carrier yet"}
      </p>
    </div>
  );
}

export async function OpsShipmentDetail({ facts, received, done }: { facts: ShipmentFacts; received: string[]; done: string[] }) {
  const s = facts.shipment;
  const [action, notice, suggestions] = await Promise.all([
    ai.suggestNextAction(s, facts.risk),
    ai.customerNotice(s, facts.eta),
    Promise.all(s.milestones.map(async (m) => [m.id, await ai.suggestMapping(m)] as const)),
  ]);
  const Icon = ACTION_ICON[action.kind];
  const noticeSent = done.includes(doneKey(s.id, "notify_customer"));
  const outForDelivery = facts.status === "out_for_delivery" && s.positions;
  const feeds = new Set(s.legs.map((l) => l.operatorId)).size;
  // The risk reasons are listed right above: repeat the rationale only when it adds something.
  const rationale = action.rationale && !facts.risk.reasons.join(" ").includes(action.rationale) ? action.rationale : "";

  return (
    <div className="space-y-6">
      <Header facts={facts} variant="ops" />
      {/* Below lg the columns dissolve into one list, so the proposed action comes right after the ETA, not after the timeline. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="max-lg:contents lg:col-span-2 lg:space-y-6">
          <EtaCard facts={facts} variant="ops" className="max-lg:order-first" />
          {outForDelivery && <MapCard shipment={s} />}
          <Card>
            <CardHeader>
              <CardTitle>Unified timeline</CardTitle>
              <p className="text-xs text-muted-foreground">
                {feeds === 1 ? "From one operator feed" : `${feeds} operator feeds merged`}. Grey tags show the raw operator status behind
                each normalized step. <TimesNote />
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
                  <TriangleAlert className="size-4" />{" "}
                  {s.invalidEvents.length === 1 ? "1 operator message" : `${s.invalidEvents.length} operator messages`} could not be read
                  and were not used.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="max-lg:contents lg:space-y-6">
          <Card className="ring-violet-200 max-lg:-order-1">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Risk assessment <AiTag />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <RiskBadge risk={facts.risk} />
              {facts.risk.reasons.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-sm text-foreground">
                  {facts.risk.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No risk factors detected.</p>
              )}
              <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3" data-testid="next-action">
                <div className="mb-1 text-xs font-semibold text-violet-800">Proposed next action</div>
                <div className="flex gap-2 font-medium">
                  <Icon className="mt-0.5 size-4 shrink-0 text-violet-700" /> {action.label}
                </div>
                {rationale && <p className="mt-1 text-sm text-foreground">{rationale}</p>}
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
                  notice && <AiTag label={notice.severity === "info" ? "Automatic" : "Drafted"} />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {notice ? (
                <div className="space-y-2" data-testid="customer-view">
                  <div
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      notice.severity === "warning" ? "border-amber-200 bg-amber-50" : "bg-muted",
                    )}
                  >
                    <div className="font-medium">{notice.title}</div>
                    <p className="mt-1 text-foreground">{notice.body}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    {notice.severity === "info"
                      ? "Informational: shown to the customer automatically"
                      : noticeSent
                        ? "Sent · visible to the customer"
                        : "Not visible to the customer yet"}
                    {/* A warning can be sent from here too when the proposed action is something else (e.g. a customs hold). */}
                    {notice.severity === "warning" && !noticeSent && action.kind !== "notify_customer" && (
                      <ActionControl
                        shipmentId={s.id}
                        action={{ kind: "notify_customer", label: "Send notice", rationale: "" }}
                        done={false}
                        compact
                      />
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No proactive notice: nothing the customer needs to know right now.</p>
              )}
            </CardContent>
          </Card>

          <DocumentsCard shipment={s} variant="ops" />
          <SimulateCard shipment={s} received={received} />
        </div>
      </div>
    </div>
  );
}

export async function CustomerShipmentDetail({ facts, received, done }: { facts: ShipmentFacts; received: string[]; done: string[] }) {
  const s = facts.shipment;
  const notice = noticeForCustomer(await ai.customerNotice(s, facts.eta), s.id, done);
  const outForDelivery = facts.status === "out_for_delivery" && s.positions;

  return (
    <div className="space-y-6">
      <Header facts={facts} variant="customer" />
      {/* A confirmed delivery window is already the ETA card's headline; any other notice adds something. */}
      {notice && !(notice.severity === "info" && facts.eta.reliability === "confirmed") && <NoticeBanner notice={notice} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <EtaCard facts={facts} variant="customer" />
          {outForDelivery && <MapCard shipment={s} />}
          <Card>
            <CardHeader>
              <CardTitle>Journey</CardTitle>
              <p className="text-xs text-muted-foreground">
                <TimesNote />
              </p>
            </CardHeader>
            <CardContent>
              <Timeline shipment={s} eta={facts.eta} variant="customer" />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <DocumentsCard shipment={s} variant="customer" />
          <SimulateCard shipment={s} received={received} />
        </div>
      </div>
    </div>
  );
}

export function NoticeBanner({ notice, href }: { notice: { title: string; body: string; severity: "info" | "warning" }; href?: string }) {
  const body = (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4",
        notice.severity === "warning" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50",
      )}
      data-testid="customer-notice"
    >
      {notice.severity === "warning" ? (
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
      ) : (
        <Info className="mt-0.5 size-5 shrink-0 text-sky-700" />
      )}
      <div>
        <div className="font-medium">{notice.title}</div>
        <p className="text-sm text-foreground">{notice.body}</p>
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
