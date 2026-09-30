import type { Leg, Milestone, TrackedShipment } from "@/domain/types";

export type LegProgress = "done" | "current" | "ahead";

/** Where along its leg the operator last placed the shipment: just left, under way, or arrived at the leg's end. */
export type LegPoint = "start" | "middle" | "end";

export type Journey = {
  legs: { leg: Leg; progress: LegProgress }[];
  /** The last position an operator reported. Absent before any report and once delivered. */
  position?: { legIndex: number; at: LegPoint; milestone: Milestone };
  delivered: boolean;
};

/**
 * The shipment's route as reported, leg by leg. Position is never interpolated along a leg: operators tell us
 * which leg it is on and whether it left, is under way, or reached the end, and that is all this draws.
 * An unrecognised code never moves it (the last recognised report stands, as for the status).
 */
export function journeyOf(s: TrackedShipment): Journey {
  const last = s.milestones.findLast((m) => m.status !== "unknown");
  const lastLeg = s.legs.at(-1)!;
  if (last?.status === "delivered" && last.legId === lastLeg.id) {
    return { legs: s.legs.map((leg) => ({ leg, progress: "done" })), delivered: true };
  }
  if (!last) return { legs: s.legs.map((leg) => ({ leg, progress: "ahead" })), delivered: false };

  const legIndex = s.legs.findIndex((l) => l.id === last.legId);
  // "At port" is the leg's end once the leg had moved (a handover, a vessel arrival), and its start otherwise (gate-in).
  const movedBefore = s.milestones.some((m) => m.legId === last.legId && m.at < last.at);
  const at: LegPoint =
    last.status === "booked" || last.status === "picked_up"
      ? "start"
      : last.status === "at_port"
        ? movedBefore
          ? "end"
          : "start"
        : "middle";
  return {
    legs: s.legs.map((leg, i) => ({ leg, progress: i < legIndex ? "done" : i === legIndex ? "current" : "ahead" })),
    position: { legIndex, at, milestone: last },
    delivered: false,
  };
}
