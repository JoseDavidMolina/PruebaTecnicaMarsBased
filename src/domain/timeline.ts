import { DEMO_NOW, hoursBetween } from "@/lib/clock";
import { normalizeEvent } from "./operators";
import type { Leg, Milestone, Mode, NormalizedStatus, RawEvent, Shipment, TrackedShipment } from "./types";

/** Max hours without an operator update before we flag the data as stale. */
export const STALE_AFTER_HOURS: Record<Mode, number> = { road: 24, sea: 72 };

/**
 * Operators report per leg: "delivered" on a leg that is not the last one means handed
 * over to the next leg, not delivered to the customer. rawStatus keeps the original.
 */
const inShipmentContext = (status: NormalizedStatus, leg: Leg, isLastLeg: boolean): NormalizedStatus =>
  status === "delivered" && !isLastLeg ? (leg.to.portCode ? "at_port" : "in_transit") : status;

/** Normalizes every raw event of a shipment into a single, time-ordered list of confirmed milestones. */
export function track(shipment: Shipment): TrackedShipment {
  const milestones: Milestone[] = [];
  const invalidEvents: RawEvent[] = [];
  const lastSeq = Math.max(...shipment.legs.map((l) => l.seq));

  shipment.events.forEach((event, i) => {
    const leg = shipment.legs.find((l) => l.id === event.legId);
    const parsed = normalizeEvent(event);
    if (!leg || !parsed) {
      invalidEvents.push(event);
      return;
    }
    milestones.push({
      ...parsed,
      id: `${shipment.id}-m${i}`,
      legId: leg.id,
      operatorId: event.operatorId,
      status: inShipmentContext(parsed.status, leg, leg.seq === lastSeq),
      reliability: "confirmed",
    });
  });

  milestones.sort((a, b) => a.at.localeCompare(b.at));
  return { ...shipment, milestones, invalidEvents };
}

/** Latest status the operators actually reported; unknown codes never override a known status. */
export function currentStatus(s: TrackedShipment): NormalizedStatus {
  // With no events yet, the only fact is our own booking.
  return s.milestones.findLast((m) => m.status !== "unknown")?.status ?? "booked";
}

export const lastMilestone = (s: TrackedShipment): Milestone | undefined => s.milestones.at(-1);

/** Latest arrival estimate the operator itself reported for a leg (confirmed data). */
export const reportedEta = (s: TrackedShipment, legId: string) => s.milestones.findLast((m) => m.legId === legId && m.eta)?.eta;

export function activeLeg(s: TrackedShipment): Leg {
  const last = lastMilestone(s);
  return s.legs.find((l) => l.id === last?.legId) ?? s.legs[0];
}

/** Hours since the last operator message, or null if none arrived yet. */
export function hoursSinceUpdate(s: TrackedShipment, now: Date = DEMO_NOW): number | null {
  const last = lastMilestone(s);
  return last ? hoursBetween(last.at, now) : null;
}

export function isStale(s: TrackedShipment, now: Date = DEMO_NOW): boolean {
  if (currentStatus(s) === "delivered") return false;
  const leg = activeLeg(s);
  const last = lastMilestone(s);
  // Before pickup, silence is expected. Measure from the planned departure instead.
  const reference = currentStatus(s) === "booked" ? leg.plannedDeparture : (last?.at ?? leg.plannedDeparture);
  return hoursBetween(reference, now) > STALE_AFTER_HOURS[leg.mode];
}

/**
 * Confirmed milestones, then one estimated "planned departure" per leg not started yet, in leg order.
 * Planned items never interleave with real ones: a plan whose date already passed is still a plan.
 */
export function unifiedTimeline(s: TrackedShipment): Milestone[] {
  const started = new Set(s.milestones.map((m) => m.legId));
  const planned: Milestone[] = s.legs
    .filter((l) => !started.has(l.id))
    .map((l) => ({
      id: `${l.id}-planned`,
      legId: l.id,
      operatorId: l.operatorId,
      rawStatus: "Planned departure (booking)",
      status: l.mode === "sea" ? "on_vessel" : "picked_up",
      at: l.plannedDeparture,
      location: l.from.name,
      reliability: "estimated",
    }));
  return [...s.milestones, ...planned];
}
