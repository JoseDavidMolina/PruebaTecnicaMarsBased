import { describe, expect, it } from "vitest";
import { currentStatus, isStale } from "@/domain/timeline";
import { getShipment, SHIPMENTS } from ".";

const hero = (id: string) => getShipment(id)!;

describe("mock data", () => {
  it("has ~20 shipments whose raw payloads are all valid", () => {
    expect(SHIPMENTS).toHaveLength(20);
    expect(SHIPMENTS.flatMap((s) => s.invalidEvents)).toEqual([]);
  });

  it("keeps the hero scenarios in their demo state", () => {
    expect(currentStatus(hero("shp-1001"))).toBe("customs_hold");
    expect(currentStatus(hero("shp-1002"))).toBe("at_port");
    expect(hero("shp-1002").legs.map((l) => l.mode)).toEqual(["road", "sea", "road"]);
    expect(isStale(hero("shp-1003"))).toBe(true);
    expect(currentStatus(hero("shp-1004"))).toBe("out_for_delivery");
    expect(hero("shp-1004").positions?.length).toBeGreaterThanOrEqual(6);
    expect(currentStatus(hero("shp-1005"))).toBe("delivered");
  });

  it("only flags the intended shipment as stale", () => {
    expect(SHIPMENTS.filter((s) => isStale(s)).map((s) => s.id)).toEqual(["shp-1003"]);
  });

  it("surfaces the undocumented Alpenweg code as unknown", () => {
    const m = hero("shp-1014").milestones.at(-1)!;
    expect(m).toMatchObject({ status: "unknown", rawCode: "X7" });
    expect(currentStatus(hero("shp-1014"))).toBe("in_transit");
  });
});
