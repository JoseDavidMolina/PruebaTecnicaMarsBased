import { describe, expect, it } from "vitest";
import { currentStatus, isStale } from "@/domain/timeline";
import { getShipment, nextOperatorMessage, SHIPMENTS, withMessages, withUploadedDocuments } from ".";

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

  it("clears SHP-1001 through customs only once its invoice is on file", () => {
    expect(nextOperatorMessage(hero("shp-1001"), [])).toBe("hold");
    const stillMissing = withMessages(hero("shp-1001"), ["hold"]);
    expect(currentStatus(stillMissing)).toBe("customs_hold");
    expect(stillMissing.milestones.at(-1)).toMatchObject({ rawStatus: "Code 40", location: "Dover" });
    // The hold is sent once; the operator's next message waits for the invoice.
    expect(nextOperatorMessage(stillMissing, ["hold"])).toBeUndefined();

    const complete = withUploadedDocuments(hero("shp-1001"));
    expect(nextOperatorMessage(complete, [])).toBe("update");
    expect(nextOperatorMessage(withUploadedDocuments(stillMissing), ["hold"])).toBe("update");
    expect(currentStatus(withMessages(complete, ["update"]))).toBe("customs_cleared");
    expect(nextOperatorMessage(complete, ["update"])).toBeUndefined();
  });

  it("keeps arrival order between messages that share a timestamp", () => {
    const s = withUploadedDocuments(hero("shp-1001"));
    const holdThenRelease = withMessages(s, ["hold", "update"]);
    expect(holdThenRelease.milestones.slice(-2).map((m) => m.rawStatus)).toEqual(["Code 40", "Code 45"]);
    expect(currentStatus(holdThenRelease)).toBe("customs_cleared");
    // Reversed arrival, reversed outcome: order comes from arrival, not from the status.
    expect(currentStatus(withMessages(s, ["update", "hold"]))).toBe("customs_hold");
  });

  it("gives the other hero shipments their single update", () => {
    for (const id of ["shp-1002", "shp-1003", "shp-1004"]) {
      expect(nextOperatorMessage(hero(id), [])).toBe("update");
      expect(nextOperatorMessage(hero(id), ["update"])).toBeUndefined();
    }
    expect(nextOperatorMessage(hero("shp-1005"), [])).toBeUndefined();
  });

  it("surfaces the undocumented Alpenweg code as unknown", () => {
    const m = hero("shp-1014").milestones.at(-1)!;
    expect(m).toMatchObject({ status: "unknown", rawCode: "X7" });
    expect(currentStatus(hero("shp-1014"))).toBe("in_transit");
  });
});
