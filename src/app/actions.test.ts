import { beforeEach, describe, expect, it, vi } from "vitest";

// A cookie jar standing in for next/headers, so the Server Actions run as they would per request.
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
}));

const { simulateUpdate } = await import("./actions");
const { DONE_COOKIE, doneKey, getDemo, SIM_COOKIE, USER_COOKIE } = await import("./demo");

const simulate = (userId: string, shipmentId: string) => {
  jar.set(USER_COOKIE, userId);
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  return simulateUpdate(form);
};

describe("simulateUpdate", () => {
  beforeEach(() => jar.clear());

  it("applies an update to a shipment inside the user's perimeter", async () => {
    await simulate("u-ops-all", "shp-1001");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1001");
  });

  it("lets a customer simulate their own shipment: it is a demo control", async () => {
    await simulate("u-cust-oskendra-mx", "shp-1002");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1002");
  });

  it("reopens the decisions ops made, but keeps an uploaded document uploaded", async () => {
    jar.set(DONE_COOKIE, [doneKey("shp-1001", "upload_document"), doneKey("shp-1001", "notify_customer"), doneKey("shp-1002", "notify_customer")].join(","));
    await simulate("u-ops-all", "shp-1001");
    expect(jar.get(DONE_COOKIE)).toBe("shp-1001:upload_document,shp-1002:notify_customer");
    // With the invoice on file, the operator's update is the customs release.
    const { shipments } = await getDemo();
    const s = shipments.find((x) => x.id === "shp-1001")!;
    expect(s.milestones.at(-1)?.status).toBe("customs_cleared");
    expect(s.documents.every((d) => d.status === "available")).toBe(true);
  });

  it("ignores a shipment outside the perimeter, even a known one", async () => {
    await simulate("u-ops-cz", "shp-1001"); // Zaragoza shipment, Brno user
    await simulate("u-cust-oskendra-mx", "shp-1004"); // another customer's parcel
    expect(jar.has(SIM_COOKIE)).toBe(false);
  });
});
