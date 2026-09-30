import { DEMO_NOW, formatDate, formatDateRange, formatDateTime, formatDuration, formatTime, hoursBetween } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import { activeLeg, currentStatus, hoursSinceUpdate, isStale, lastMilestone } from "@/domain/timeline";
import { DOCUMENT_LABELS, type Milestone, type NormalizedStatus, type TrackedShipment } from "@/domain/types";
import { customerOf } from "@/data";
import { isLate, predictEta } from "./eta";
import { parseQuery, type ShipmentFacts } from "./query";
import { assessRisk, portDelayHours } from "./risk";
import {
  CustomerNoticeSchema,
  DailySummarySchema,
  EtaPredictionSchema,
  MappingSuggestionSchema,
  NextActionSchema,
  QueryAnswerSchema,
  RiskAssessmentSchema,
  ShipmentQuerySchema,
  type CustomerNotice,
  type DailySummary,
  type EtaPrediction,
  type MappingSuggestion,
  type NextAction,
  type QueryAnswer,
  type RiskAssessment,
  type RiskFlag,
  type ShipmentQuery,
} from "./types";

/**
 * Everything the UI asks of "the AI". Async because a real LLM/ML backend would be.
 * Swap mockAiService for a real implementation without touching components.
 */
export interface AiService {
  assessRisk(s: TrackedShipment): Promise<RiskAssessment>;
  predictEta(s: TrackedShipment): Promise<EtaPrediction>;
  suggestNextAction(s: TrackedShipment, risk: RiskAssessment): Promise<NextAction>;
  summarizeDay(shipments: TrackedShipment[]): Promise<DailySummary>;
  parseQuery(text: string): Promise<ShipmentQuery>;
  customerNotice(s: TrackedShipment, eta: EtaPrediction): Promise<CustomerNotice | null>;
  /** A direct answer to a search, grounded only in the matching shipments' facts. */
  answerQuery(query: ShipmentQuery, matches: ShipmentFacts[]): Promise<QueryAnswer>;
  suggestMapping(m: Milestone): Promise<MappingSuggestion | null>;
}

// --- Mock logic (pure) --------------------------------------------------------

export function suggestNextAction(s: TrackedShipment, risk: RiskAssessment): NextAction {
  const operator = OPERATORS[activeLeg(s).operatorId].name;
  const has = (f: RiskAssessment["flags"][number]) => risk.flags.includes(f);
  const missing = s.documents.filter((d) => d.status === "missing").map((d) => DOCUMENT_LABELS[d.kind]);

  if (has("customs_hold") && missing.length) {
    return {
      kind: "upload_document",
      label: `Upload ${missing.join(", ").toLowerCase()}`,
      rationale: `Customs is holding the shipment and the file is missing: ${missing.join(", ").toLowerCase()}.`,
    };
  }
  if (has("customs_hold")) {
    return { kind: "contact_operator", label: `Ask ${operator} why customs is holding it`, rationale: "Held at customs with every document on file." };
  }
  if (has("exception")) {
    return { kind: "contact_operator", label: `Contact ${operator} about the incident`, rationale: risk.reasons[0] };
  }
  if (has("stale")) {
    return {
      kind: "contact_operator",
      label: `Request a status update from ${operator}`,
      rationale: risk.reasons.find((r) => r.startsWith("No operator update")) ?? "",
    };
  }
  if (has("late") || has("port_delay")) {
    return {
      kind: "notify_customer",
      label: `Notify ${customerOf(s).name} of the new ETA`,
      rationale: risk.reasons.filter((r) => /behind plan|past the promised/.test(r)).join(" "),
    };
  }
  if (has("unrecognised_update")) {
    return {
      kind: "contact_operator",
      label: `Ask ${operator} what their latest update means`,
      rationale: risk.reasons.find((r) => r.includes("don't recognise")) ?? "",
    };
  }
  return { kind: "none", label: "No action needed", rationale: "On track." };
}

// Each at-risk shipment is counted once, under its first matching cause, so the breakdown adds up to the total.
const SUMMARY_CAUSES: [RiskFlag, string][] = [
  ["customs_hold", "held at customs"],
  ["port_delay", "delayed at port"],
  ["stale", "with no recent update"],
  ["exception", "with a delivery incident"],
  ["late", "running late"],
  ["missing_document", "missing documents"],
];

export function summarizeDay(shipments: TrackedShipment[], now: Date = DEMO_NOW): DailySummary {
  const assessed = shipments.map((s) => ({ s, risk: assessRisk(s, now) }));
  const open = assessed.filter(({ s }) => currentStatus(s) !== "delivered");
  const atRisk = open.filter(({ risk }) => risk.level !== "low").sort((a, b) => b.risk.score - a.risk.score);
  const flagged = (f: RiskAssessment["flags"][number]) => open.filter(({ risk }) => risk.flags.includes(f)).length;

  const counts = {
    atRisk: atRisk.length,
    customsHold: flagged("customs_hold"),
    portDelay: flagged("port_delay"),
    stale: flagged("stale"),
    exceptions: flagged("exception"),
    outForDelivery: open.filter(({ s }) => currentStatus(s) === "out_for_delivery").length,
    deliveredToday: shipments.filter((s) => {
      const d = s.milestones.findLast((m) => m.status === "delivered");
      return d && hoursBetween(d.at, now) <= 24;
    }).length,
  };

  const causes = atRisk.map(({ risk }) => SUMMARY_CAUSES.find(([f]) => risk.flags.includes(f)));
  const detail = SUMMARY_CAUSES.map((cause) => [causes.filter((c) => c === cause).length, cause[1]] as const)
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`);

  return {
    headline:
      `Today: ${counts.atRisk} at risk${detail.length ? ` (${detail.join(", ")})` : ""}, ` +
      `${counts.outForDelivery} out for delivery, ${counts.deliveredToday} delivered.`,
    counts,
    items: atRisk.map(({ s, risk }) => ({ shipmentId: s.id, score: risk.score, action: suggestNextAction(s, risk) })),
  };
}

/** Plain-language notice for the customer, or null when there is nothing worth telling them. */
export function customerNotice(s: TrackedShipment, eta: EtaPrediction, now: Date = DEMO_NOW): CustomerNotice | null {
  const status = currentStatus(s);
  const last = lastMilestone(s);
  const leg = activeLeg(s);
  const when = `${formatDateRange(eta.earliest, eta.latest)} (${eta.confidence} confidence)`;

  if (status === "delivered") return null;
  if (status === "customs_hold") {
    return {
      severity: "warning",
      title: "Your shipment is held at customs",
      body: `Customs is reviewing your shipment in ${last?.location ?? leg.to.name}. Clearance usually takes about 2 days. New estimated delivery: ${when}.`,
    };
  }
  // Only state what the data supports: no invented causes, no promises about actions nobody has taken yet.
  if (isStale(s, now)) {
    return {
      severity: "info",
      title: "Waiting for an update from the carrier",
      body: `The carrier has not sent an update for ${formatDuration(hoursSinceUpdate(s, now) ?? 0)}, so this estimate is less certain. Current estimate: ${when}.`,
    };
  }
  if (status === "exception") {
    return {
      severity: "warning",
      title: "There was a problem with your delivery",
      body: `The carrier reported: "${last?.rawStatus}". New estimated delivery: ${when}.`,
    };
  }
  if (isLate(eta)) {
    const portDelay = portDelayHours(s, now);
    const cause = portDelay > 0 ? `The vessel is running ${formatDuration(portDelay)} behind schedule at the ${leg.to.name}.` : "It is taking longer than planned in transit.";
    return {
      severity: "warning",
      title: `Your shipment will arrive ${formatDuration(eta.delayHours)} later than planned`,
      body: `${cause} New estimated delivery: ${when}.`,
    };
  }
  if (status === "out_for_delivery" && eta.reliability === "confirmed") {
    return {
      severity: "info",
      title: `Arriving today, ${formatTime(eta.earliest)}–${formatTime(eta.latest)}`,
      body: "Your shipment is out for delivery. The carrier confirmed this delivery window.",
    };
  }
  return null;
}

const STATUS_PHRASE: Record<NormalizedStatus, string> = {
  booked: "booked and waiting for pickup",
  picked_up: "picked up",
  in_transit: "in transit",
  at_port: "at port",
  on_vessel: "at sea",
  customs_hold: "held at customs",
  customs_cleared: "cleared through customs",
  out_for_delivery: "out for delivery",
  delivered: "delivered",
  exception: "affected by an incident",
  unknown: "in an unknown state",
};

const etaSentence = ({ status, eta }: ShipmentFacts): string => {
  if (status === "delivered") return `Delivered on ${formatDateTime(eta.expected)}.`;
  if (eta.reliability === "confirmed") return `The carrier confirmed delivery on ${formatDate(eta.earliest)}, ${formatTime(eta.earliest)}–${formatTime(eta.latest)}.`;
  const late = isLate(eta) ? `, ${formatDuration(eta.delayHours)} late` : "";
  return `Estimated delivery: ${formatDateRange(eta.earliest, eta.latest)} (${eta.confidence} confidence)${late}.`;
};

// Every sentence is built from derived facts, the same constraint a real LLM answer would be held to.
export function answerQuery(matches: ShipmentFacts[]): QueryAnswer {
  if (matches.length === 0) return { text: "No shipments match. Try fewer conditions, or check the reference." };

  if (matches.length === 1) {
    const f = matches[0];
    const s = f.shipment;
    const last = lastMilestone(s);
    const action = suggestNextAction(s, f.risk);
    const text = [
      `${s.reference} (order ${s.orderRef}, ${customerOf(s).name}) is ${STATUS_PHRASE[f.status]}.`,
      last && `Last update from ${OPERATORS[last.operatorId].name}: ${formatDateTime(last.at)}${last.location ? ` in ${last.location}` : ""}.`,
      ...f.risk.reasons.filter((r) => !r.startsWith("ETA is") && !r.startsWith("Low confidence")), // the ETA sentence covers these
      etaSentence(f),
      action.kind !== "none" && `Suggested next step: ${action.label}.`,
    ]
      .filter(Boolean)
      .join(" ");
    return { text, shipmentId: s.id };
  }

  const open = matches.filter((f) => f.status !== "delivered");
  const attention = open.filter((f) => f.risk.level !== "low").sort((a, b) => b.risk.score - a.risk.score);
  const late = open.filter((f) => isLate(f.eta)).length;
  const worst = attention[0];
  const text = [
    `${matches.length} shipments match.`,
    attention.length ? `${attention.length} ${attention.length === 1 ? "needs" : "need"} attention${late ? `, ${late} running late` : ""}.` : "None needs attention.",
    worst && `Most urgent: ${worst.shipment.reference}, ${STATUS_PHRASE[worst.status]}. ${suggestNextAction(worst.shipment, worst.risk).label}.`,
  ]
    .filter(Boolean)
    .join(" ");
  return { text };
}

// ponytail: a tiny glossary standing in for an LLM reading the operator's own wording. It only suggests;
// a person confirms the mapping before it changes any status.
const GLOSSARY: [RegExp, Exclude<NormalizedStatus, "unknown">, string][] = [
  [/umladung|umschlag/i, "in_transit", "Transshipment: the goods are being moved between vehicles at a hub"],
  [/verzögerung|verspätung/i, "exception", "The operator is reporting a delay"],
  [/zoll/i, "customs_hold", "A customs-related update"],
];

export function suggestMapping(m: Milestone): MappingSuggestion | null {
  if (m.status !== "unknown") return null;
  const hit = GLOSSARY.find(([re]) => re.test(m.rawStatus));
  return hit ? { status: hit[1], meaning: hit[2], confidence: "medium" } : null;
}

/** The shipment plus everything derived from it; what lists, filters and search work with. */
export function factsFor(s: TrackedShipment, now: Date = DEMO_NOW): ShipmentFacts {
  const eta = predictEta(s, now);
  return {
    shipment: s,
    status: currentStatus(s),
    stale: isStale(s, now),
    eta,
    risk: assessRisk(s, now, eta),
    destinationCountry: customerOf(s).place.country,
  };
}

// --- Mock service: same logic, validated like a real model's output ------------

export const mockAiService: AiService = {
  assessRisk: async (s) => RiskAssessmentSchema.parse(assessRisk(s)),
  predictEta: async (s) => EtaPredictionSchema.parse(predictEta(s)),
  suggestNextAction: async (s, risk) => NextActionSchema.parse(suggestNextAction(s, risk)),
  summarizeDay: async (shipments) => DailySummarySchema.parse(summarizeDay(shipments)),
  parseQuery: async (text) => ShipmentQuerySchema.parse(parseQuery(text)),
  customerNotice: async (s, eta) => {
    const notice = customerNotice(s, eta);
    return notice && CustomerNoticeSchema.parse(notice);
  },
  answerQuery: async (_query, matches) => QueryAnswerSchema.parse(answerQuery(matches)),
  suggestMapping: async (m) => {
    const suggestion = suggestMapping(m);
    return suggestion && MappingSuggestionSchema.parse(suggestion);
  },
};
