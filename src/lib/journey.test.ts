import { describe, expect, it } from "vitest";
import { getShipment } from "@/data";
import { journeyOf } from "./journey";

const journey = (id: string) => journeyOf(getShipment(id)!);
const progress = (id: string) => journey(id).legs.map((l) => l.progress);

describe("journeyOf", () => {
  it("places the multimodal shipment at the end of its sea leg, arrived at Veracruz", () => {
    expect(progress("shp-1002")).toEqual(["done", "current", "ahead"]);
    expect(journey("shp-1002").position).toMatchObject({ legIndex: 1, at: "end" });
  });

  it("puts a customs hold under way on its leg, not at a node", () => {
    expect(journey("shp-1001").position).toMatchObject({ legIndex: 0, at: "middle", milestone: { status: "customs_hold" } });
  });

  it("marks every leg done once delivered, with no position marker", () => {
    expect(journey("shp-1005").delivered).toBe(true);
    expect(journey("shp-1005").position).toBeUndefined();
    expect(progress("shp-1005")).toEqual(["done"]);
  });

  it("keeps the last recognised position when the latest code is unrecognised", () => {
    expect(journey("shp-1014").position?.milestone.status).toBe("in_transit");
  });

  it("shows the last-mile leg under way while out for delivery", () => {
    expect(progress("shp-1004")).toEqual(["done", "current"]);
    expect(journey("shp-1004").position).toMatchObject({ at: "middle", milestone: { status: "out_for_delivery" } });
  });
});
