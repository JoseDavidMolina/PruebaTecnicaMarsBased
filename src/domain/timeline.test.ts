import { describe, expect, it } from "vitest";
import { addHours, DEMO_NOW } from "@/lib/clock";
import { currentStatus, isStale, track, unifiedTimeline } from "./timeline";
import type { Leg, RawEvent, Shipment } from "./types";

const place = { name: "X", country: "ES", lat: 0, lng: 0 };
const leg = (seq: number, mode: Leg["mode"], extra: Partial<Leg> = {}): Leg => ({
  id: `L${seq}`,
  seq,
  mode,
  operatorId: mode === "sea" ? "bluemeridian" : "transvolta",
  operatorRef: "REF",
  from: place,
  to: place,
  plannedDeparture: addHours(DEMO_NOW, -48),
  plannedArrival: addHours(DEMO_NOW, 48),
  ...extra,
});
const tv = (legId: string, code: number, hoursAgo: number): RawEvent => ({
  legId,
  operatorId: "transvolta",
  payload: { code, ts: (DEMO_NOW.getTime() - hoursAgo * 3_600_000) / 1000, depot: "Depot" },
});
const shipment = (legs: Leg[], events: RawEvent[]): Shipment => ({
  id: "S1",
  reference: "SHP-1",
  orderRef: "PO-1",
  originSiteId: "site",
  customerId: "cust",
  promisedDelivery: addHours(DEMO_NOW, 72),
  legs,
  events,
  documents: [],
});

describe("track", () => {
  it("sorts milestones and treats 'delivered' on a non-final leg as a handover", () => {
    const s = track(
      shipment(
        [leg(1, "road", { to: { ...place, portCode: "ESVLC" } }), leg(2, "sea")],
        [tv("L1", 60, 10), tv("L1", 20, 30)],
      ),
    );
    expect(s.milestones.map((m) => m.status)).toEqual(["picked_up", "at_port"]);
    expect(s.milestones[1].rawCode).toBe("60");
  });

  it("keeps invalid payloads aside instead of dropping them silently", () => {
    const bad: RawEvent = { legId: "L1", operatorId: "transvolta", payload: { code: "x" } };
    const s = track(shipment([leg(1, "road")], [tv("L1", 20, 5), bad]));
    expect(s.milestones).toHaveLength(1);
    expect(s.invalidEvents).toEqual([bad]);
  });

  it("ignores unknown codes when computing the current status", () => {
    const s = track(shipment([leg(1, "road")], [tv("L1", 30, 5), tv("L1", 77, 1)]));
    expect(currentStatus(s)).toBe("in_transit");
  });
});

describe("isStale", () => {
  it("uses a per-mode threshold", () => {
    expect(isStale(track(shipment([leg(1, "road")], [tv("L1", 30, 30)])))).toBe(true);
    expect(isStale(track(shipment([leg(1, "road")], [tv("L1", 30, 20)])))).toBe(false);
  });

  it("does not flag a booked shipment before its planned pickup", () => {
    const s = track(shipment([leg(1, "road", { plannedDeparture: addHours(DEMO_NOW, 6) })], [tv("L1", 10, 40)]));
    expect(isStale(s)).toBe(false);
  });
});

describe("unifiedTimeline", () => {
  it("adds an estimated planned departure for legs not started yet", () => {
    const s = track(shipment([leg(1, "road"), leg(2, "sea", { plannedDeparture: addHours(DEMO_NOW, 24) })], [tv("L1", 20, 5)]));
    const timeline = unifiedTimeline(s);
    expect(timeline.map((m) => [m.status, m.reliability])).toEqual([
      ["picked_up", "confirmed"],
      ["on_vessel", "estimated"],
    ]);
  });
});
