import { describe, expect, it } from "vitest";
import { visibleShipments } from "./perimeter";
import type { Shipment, User } from "./types";

const shipment = (id: string, originSiteId: string, customerId: string): Shipment => ({
  id,
  reference: id,
  orderRef: id,
  originSiteId,
  customerId,
  promisedDelivery: "2026-10-07T07:00:00.000Z",
  legs: [],
  events: [],
  documents: [],
});

const ALL = [
  shipment("a", "site-1", "cust-1"),
  shipment("b", "site-2", "cust-1"),
  shipment("c", "site-2", "cust-2"),
  shipment("d", "site-3", "cust-3"),
];
const ids = (user: User) => visibleShipments(user, ALL).map((s) => s.id);

describe("visibleShipments", () => {
  it("shows a customer only its own shipments, from any site", () => {
    expect(ids({ id: "u", name: "C1", role: "customer", customerId: "cust-1" })).toEqual(["a", "b"]);
    expect(ids({ id: "u", name: "C2", role: "customer", customerId: "cust-2" })).toEqual(["c"]);
    expect(ids({ id: "u", name: "Nobody", role: "customer", customerId: "cust-9" })).toEqual([]);
  });

  it("shows an ops user exactly the shipments leaving its sites", () => {
    expect(ids({ id: "u", name: "Two sites", role: "ops", siteIds: ["site-1", "site-3"] })).toEqual(["a", "d"]);
    expect(ids({ id: "u", name: "One site", role: "ops", siteIds: ["site-2"] })).toEqual(["b", "c"]);
    expect(ids({ id: "u", name: "No site", role: "ops", siteIds: [] })).toEqual([]);
  });

  it("does not leak across: same customer from another site, or another customer from the same site", () => {
    // cust-1 also ships from site-2, and site-2 also ships to cust-2.
    expect(ids({ id: "u", name: "One site", role: "ops", siteIds: ["site-1"] })).not.toContain("b");
    expect(ids({ id: "u", name: "C1", role: "customer", customerId: "cust-1" })).not.toContain("c");
  });
});
