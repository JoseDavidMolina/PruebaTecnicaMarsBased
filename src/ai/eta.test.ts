import { describe, expect, it } from "vitest";
import { addHours, DEMO_NOW, hoursBetween } from "@/lib/clock";
import { track } from "@/domain/timeline";
import { getShipment, SIMULATED_UPDATES } from "@/data";
import { isLate, predictEta } from "./eta";

const eta = (id: string) => predictEta(getShipment(id)!);
const withUpdate = (id: string) => {
  const s = getShipment(id)!;
  return track({ ...s, events: [...s.events, SIMULATED_UPDATES[id]] });
};

describe("predictEta", () => {
  it("is confirmed once the operator reports delivery", () => {
    expect(eta("shp-1005")).toMatchObject({ reliability: "confirmed", confidence: "high", delayHours: -6 });
  });

  it("uses the courier's delivery window as a confirmed ETA", () => {
    expect(eta("shp-1004")).toMatchObject({
      reliability: "confirmed",
      earliest: "2026-10-07T09:00:00.000Z",
      latest: "2026-10-07T11:00:00.000Z",
      expected: "2026-10-07T10:00:00.000Z",
    });
  });

  it("builds on the carrier's vessel ETA plus the remaining legs for a multimodal shipment", () => {
    const e = eta("shp-1002");
    // Vessel ETA at Veracruz is +54h, last-mile leg is planned at 48h.
    expect(e).toMatchObject({ reliability: "estimated", confidence: "medium", expected: addHours(DEMO_NOW, 102), delayHours: 54 });
    expect(isLate(e)).toBe(true);
  });

  it("adds customs clearance time and widens the range during a hold", () => {
    const e = eta("shp-1001");
    expect(e.confidence).toBe("low");
    expect(e.delayHours).toBeGreaterThan(24);
    expect(e.explanation).toMatch(/customs/i);
  });

  it("drops to low confidence with a wide range when data is stale", () => {
    const e = eta("shp-1003");
    expect(e.confidence).toBe("low");
    expect(hoursBetween(e.earliest, e.latest)).toBeGreaterThan(72);
    expect(e.explanation).toMatch(/no operator update/i);
  });

  it("never estimates an arrival in the past", () => {
    for (const id of ["shp-1001", "shp-1003", "shp-1016"]) {
      expect(new Date(eta(id).earliest).getTime()).toBeGreaterThanOrEqual(DEMO_NOW.getTime());
    }
  });

  it("is on time for a normal road shipment", () => {
    expect(isLate(eta("shp-1006"))).toBe(false);
    expect(eta("shp-1006").confidence).toBe("high");
  });

  it("recomputes when the operator sends an update", () => {
    // The vessel berths and the carrier moves discharge to +12h.
    expect(predictEta(withUpdate("shp-1002")).delayHours).toBe(12);
    expect(predictEta(withUpdate("shp-1004"))).toMatchObject({ reliability: "confirmed", expected: DEMO_NOW.toISOString() });
  });
});
