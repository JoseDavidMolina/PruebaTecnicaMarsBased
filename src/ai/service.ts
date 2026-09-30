import { DEMO_NOW, formatDateRange, formatDuration, formatTime, hoursBetween } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import { activeLeg, currentStatus, isStale, lastMilestone } from "@/domain/timeline";
import { DOCUMENT_LABELS, type TrackedShipment } from "@/domain/types";
import { customerOf } from "@/data";
import { isLate, predictEta } from "./eta";
import { parseQuery, type ShipmentFacts } from "./query";
import { assessRisk } from "./risk";
import {
  CustomerNoticeSchema,
  DailySummarySchema,
  EtaPredictionSchema,
  NextActionSchema,
  RiskAssessmentSchema,
  ShipmentQuerySchema,
  type CustomerNotice,
  type DailySummary,
  type EtaPrediction,
  type NextAction,
  type RiskAssessment,
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
  return { kind: "none", label: "No action needed", rationale: "On track." };
}

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

  const detail = [
    counts.customsHold && `${counts.customsHold} held at customs`,
    counts.portDelay && `${counts.portDelay} delayed at port`,
    counts.stale && `${counts.stale} with no recent update`,
    counts.exceptions && `${counts.exceptions} with a delivery incident`,
  ].filter(Boolean);

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
      body: `Customs is reviewing your shipment in ${last?.location ?? leg.to.name}. We are already providing the documents they need. New estimated delivery: ${when}.`,
    };
  }
  if (isStale(s, now)) {
    return {
      severity: "info",
      title: "We are checking on your shipment",
      body: `The carrier has not sent an update recently, so we have asked them for one. Current estimate: ${when}.`,
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
    const cause = leg.mode === "sea" && status === "at_port" ? `congestion at the ${leg.to.name}` : "a delay in transit";
    return {
      severity: "warning",
      title: `Your shipment will arrive ${formatDuration(eta.delayHours)} later than planned`,
      body: `This is due to ${cause}. New estimated delivery: ${when}.`,
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
};
