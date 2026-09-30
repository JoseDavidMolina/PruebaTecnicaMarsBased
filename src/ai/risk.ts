import { DEMO_NOW, formatDuration, hoursBetween } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import { activeLeg, currentStatus, hoursSinceUpdate, isStale, lastMilestone, reportedEta, STALE_AFTER_HOURS } from "@/domain/timeline";
import { DOCUMENT_LABELS, type TrackedShipment } from "@/domain/types";
import { isLate, predictEta } from "./eta";
import type { EtaPrediction, RiskAssessment, RiskFlag } from "./types";

// ponytail: hand-tuned weights standing in for a model trained on past incidents; keep them here so they are easy to tune.
const WEIGHTS = { customs_hold: 45, exception: 40, stale: 35, port_delay: 30, missing_document: 15, unrecognised_update: 15, low_confidence: 10 };

/** Hours the sea leg is behind its plan, by the carrier's own ETA or by the clock. */
export function portDelayHours(s: TrackedShipment, now: Date = DEMO_NOW): number {
  const leg = activeLeg(s);
  if (leg.mode !== "sea" || !["at_port", "on_vessel"].includes(currentStatus(s))) return 0;
  const reported = reportedEta(s, leg.id);
  return Math.max(0, hoursBetween(leg.plannedArrival, reported?.latest ?? now));
}

export function assessRisk(s: TrackedShipment, now: Date = DEMO_NOW, eta: EtaPrediction = predictEta(s, now)): RiskAssessment {
  const status = currentStatus(s);
  if (status === "delivered") return { score: 0, level: "low", flags: [], reasons: [] };

  const flags: RiskFlag[] = [];
  const reasons: string[] = [];
  let score = 0;
  const leg = activeLeg(s);

  if (status === "customs_hold") {
    const since = s.milestones.find((m) => m.status === "customs_hold")!;
    flags.push("customs_hold");
    reasons.push(`Held at customs in ${since.location ?? leg.to.name} for ${formatDuration(hoursBetween(since.at, now))}.`);
    score += WEIGHTS.customs_hold;
  }
  if (status === "exception") {
    flags.push("exception");
    reasons.push(`${OPERATORS[leg.operatorId].name} reported: "${lastMilestone(s)!.rawStatus}".`);
    score += WEIGHTS.exception;
  }
  if (isStale(s, now)) {
    flags.push("stale");
    reasons.push(`No operator update for ${formatDuration(hoursSinceUpdate(s, now) ?? 0)} (expected at least every ${STALE_AFTER_HOURS[leg.mode]}h by ${leg.mode}).`);
    score += WEIGHTS.stale;
  }
  const portDelay = portDelayHours(s, now);
  if (portDelay > 12) {
    flags.push("port_delay");
    reasons.push(`Vessel ${formatDuration(portDelay)} behind plan at ${leg.to.name}.`);
    score += WEIGHTS.port_delay;
  }
  const missing = s.documents.filter((d) => d.status === "missing");
  if (missing.length) {
    flags.push("missing_document");
    reasons.push(`Missing: ${missing.map((d) => DOCUMENT_LABELS[d.kind]).join(", ")}.`);
    score += WEIGHTS.missing_document;
  }
  const last = lastMilestone(s);
  if (last?.status === "unknown") {
    flags.push("unrecognised_update");
    reasons.push(`${OPERATORS[last.operatorId].name} sent an update we don't recognise ("${last.rawStatus}"); the status shown is from the previous one.`);
    score += WEIGHTS.unrecognised_update;
  }
  if (isLate(eta)) {
    flags.push("late");
    reasons.push(`ETA is ${formatDuration(eta.delayHours)} past the promised date.`);
    score += 30 + Math.min(15, eta.delayHours / 4);
  }
  if (eta.confidence === "low") {
    reasons.push("Low confidence in the ETA.");
    score += WEIGHTS.low_confidence;
  }

  score = Math.min(100, Math.round(score));
  return { score, level: score >= 60 ? "high" : score >= 30 ? "medium" : "low", flags, reasons };
}
