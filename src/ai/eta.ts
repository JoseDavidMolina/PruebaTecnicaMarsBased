import { addHours, DEMO_NOW, formatDate, formatDuration, formatTime, hoursBetween } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import { activeLeg, currentStatus, hoursSinceUpdate, isStale, lastMilestone, reportedEta } from "@/domain/timeline";
import type { Confidence, Leg, Mode, TrackedShipment } from "@/domain/types";
import type { EtaPrediction } from "./types";

/** An ETA this far past the promised date counts as late. */
export const LATE_AFTER_HOURS = 2;

// NOTE(simplification): fixed heuristics standing in for a model trained on historical transit times per lane/operator.
const LEG_UNCERTAINTY_HOURS: Record<Mode, number> = { road: 4, sea: 24 };
const CUSTOMS_HOLD_HOURS = 48;
const EXCEPTION_HOURS = 24;

const duration = (l: Leg) => hoursBetween(l.plannedDeparture, l.plannedArrival);

export const isLate = (eta: EtaPrediction) => eta.delayHours > LATE_AFTER_HOURS;

export function predictEta(s: TrackedShipment, now: Date = DEMO_NOW): EtaPrediction {
  const status = currentStatus(s);
  const delayHours = (expected: string) => Math.round(hoursBetween(s.promisedDelivery, expected));
  const leg = activeLeg(s);
  const operator = OPERATORS[leg.operatorId].name;
  const reported = reportedEta(s, leg.id);

  // Confirmed: the operator says it happened, or gave the delivery window itself.
  if (status === "delivered") {
    const at = s.milestones.findLast((m) => m.status === "delivered")!.at;
    return {
      expected: at, earliest: at, latest: at,
      reliability: "confirmed", confidence: "high", delayHours: delayHours(at),
      explanation: `Delivered on ${formatDate(at)}, confirmed by ${operator}.`,
    };
  }
  if (status === "out_for_delivery" && reported && leg.seq === s.legs.length) {
    const expected = addHours(reported.earliest, hoursBetween(reported.earliest, reported.latest) / 2);
    return {
      expected, earliest: reported.earliest, latest: reported.latest,
      reliability: "confirmed", confidence: "high", delayHours: delayHours(expected),
      explanation: `${operator} confirmed a delivery window of ${formatTime(reported.earliest)}–${formatTime(reported.latest)}.`,
    };
  }

  // Estimated: time left on the current leg, plus holds, plus the planned duration of the remaining legs.
  const reasons: string[] = [];
  let hoursLeft: number;
  let uncertainty = LEG_UNCERTAINTY_HOURS[leg.mode];
  let overdue = false;

  if (reported) {
    hoursLeft = hoursBetween(now, reported.latest);
    reasons.push(`${operator} reports arrival at ${leg.to.name} on ${formatDate(reported.latest)}.`);
  } else if (status === "booked") {
    const latePickup = Math.max(0, hoursBetween(leg.plannedDeparture, now));
    hoursLeft = hoursBetween(now, leg.plannedArrival) + latePickup;
    reasons.push(latePickup > 0 ? `Pickup is ${Math.round(latePickup)}h behind plan.` : "Based on planned transit times.");
  } else {
    const toPlan = hoursBetween(now, leg.plannedArrival);
    // Past its plan with no revised ETA from the operator: we know least here, so the range widens by the overdue hours.
    overdue = toPlan <= 0;
    hoursLeft = overdue ? duration(leg) * 0.25 : toPlan;
    if (overdue) uncertainty += -toPlan;
    reasons.push(
      overdue
        ? `The leg to ${leg.to.name} was due on ${formatDate(leg.plannedArrival)}, ${formatDuration(-toPlan)} ago, and ${operator} has given no revised ETA.`
        : isStale(s, now)
          ? `Planned to reach ${leg.to.name} on ${formatDate(leg.plannedArrival)}.` // no fresh data to say it is on track
          : "In transit, on track against planned transit time.",
    );
  }

  if (status === "customs_hold") {
    hoursLeft += CUSTOMS_HOLD_HOURS;
    uncertainty += CUSTOMS_HOLD_HOURS;
    reasons.push("Customs clearance typically adds about 2 days.");
  }
  if (status === "exception") {
    hoursLeft += EXCEPTION_HOURS;
    uncertainty += EXCEPTION_HOURS;
    reasons.push("The operator reported an incident; allowing one extra day.");
  }
  const stale = isStale(s, now);
  if (stale) {
    const silent = hoursSinceUpdate(s, now) ?? 0;
    uncertainty += silent;
    reasons.push(`No operator update for ${Math.round(silent)}h, so this assumes planned progress.`);
  }
  // An unreadable latest update is still information we don't have: never report high confidence over it.
  const unread = lastMilestone(s)?.status === "unknown";
  if (unread) reasons.push("The latest operator update could not be read, so this is based on the one before.");
  const remaining = s.legs.filter((l) => l.seq > leg.seq);
  for (const next of remaining) {
    hoursLeft += duration(next);
    uncertainty += LEG_UNCERTAINTY_HOURS[next.mode];
  }
  if (remaining.length) {
    reasons.push(`Then ${remaining.map((l) => `${l.mode} to ${l.to.name} (${formatDuration(duration(l))} planned)`).join(", ")}.`);
  }

  hoursLeft = Math.max(1, hoursLeft);
  const expected = addHours(now, hoursLeft);
  const confidence: Confidence = stale || uncertainty > 48 ? "low" : uncertainty > 12 || unread || overdue ? "medium" : "high";

  return {
    expected,
    earliest: addHours(now, Math.max(0, hoursLeft - uncertainty / 2)),
    latest: addHours(now, hoursLeft + uncertainty),
    reliability: "estimated",
    confidence,
    delayHours: delayHours(expected),
    explanation: reasons.join(" "),
  };
}
