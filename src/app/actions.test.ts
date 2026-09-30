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

const { completeAction, simulateUpdate } = await import("./actions");
const { DONE_COOKIE, doneKey, getDemo, SIM_COOKIE, USER_COOKIE } = await import("./demo");

const simulate = (userId: string, shipmentId: string) => {
  jar.set(USER_COOKIE, userId);
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  return simulateUpdate(form);
};

const upload = (shipmentId: string) => {
  const form = new FormData();
  form.set("shipmentId", shipmentId);
  form.set("kind", "upload_document");
  return completeAction(form);
};

/** SHP-1001's operator messages as the ops user sees them: "HH:MM rawStatus". */
const messages1001 = async () => {
  const s = (await getDemo()).shipments.find((x) => x.id === "shp-1001")!;
  return s.milestones.filter((m) => m.at === "2026-10-07T07:00:00.000Z").map((m) => m.rawStatus);
};

describe("simulateUpdate", () => {
  beforeEach(() => jar.clear());

  it("applies an update to a shipment inside the user's perimeter", async () => {
    await simulate("u-ops-all", "shp-1001");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1001:hold");
  });

  it("lets a customer simulate their own shipment: it is a demo control", async () => {
    await simulate("u-cust-oskendra-mx", "shp-1002");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1002:update");
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

describe("operator messages, once received, never change", () => {
  beforeEach(() => jar.clear());

  it("simulate → upload: the hold already received stays a hold", async () => {
    await simulate("u-ops-all", "shp-1001");
    expect(await messages1001()).toEqual(["Code 40"]);
    await upload("shp-1001");
    expect(await messages1001()).toEqual(["Code 40"]);
  });

  it("simulate → upload → simulate: the release arrives as a new event after the hold", async () => {
    await simulate("u-ops-all", "shp-1001");
    await simulate("u-ops-all", "shp-1001"); // nothing more until the invoice is on file
    expect(jar.get(SIM_COOKIE)).toBe("shp-1001:hold");
    await upload("shp-1001");
    await simulate("u-ops-all", "shp-1001");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1001:hold,shp-1001:update");
    expect(await messages1001()).toEqual(["Code 40", "Code 45"]);
    const s = (await getDemo()).shipments.find((x) => x.id === "shp-1001")!;
    expect(s.milestones.at(-1)?.status).toBe("customs_cleared");
  });

  it("upload → simulate: the release comes directly", async () => {
    jar.set(USER_COOKIE, "u-ops-all");
    await upload("shp-1001");
    await simulate("u-ops-all", "shp-1001");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1001:update");
    expect(await messages1001()).toEqual(["Code 45"]);
  });

  it("ignores tampered cookie values without breaking the page", async () => {
    jar.set(USER_COOKIE, "u-ops-all");
    jar.set(SIM_COOKIE, "shp-9999:update,shp-1001:bogus,shp-1005:update,shp-1001,:update,garbage,,shp-1002:update:x,constructor:update,shp-1003:update,shp-1003:update");
    const { simulated, shipments } = await getDemo();
    expect(simulated).toEqual(["shp-1003:update"]);
    expect(await messages1001()).toEqual([]);
    expect(shipments.find((x) => x.id === "shp-1003")!.milestones.filter((m) => m.at === "2026-10-07T07:00:00.000Z")).toHaveLength(1);
    // The next simulation writes a clean cookie.
    await simulate("u-ops-all", "shp-1001");
    expect(jar.get(SIM_COOKIE)).toBe("shp-1003:update,shp-1001:hold");
  });

  it("does not replay another user's messages on shipments outside the perimeter", async () => {
    jar.set(SIM_COOKIE, "shp-1001:hold");
    jar.set(USER_COOKIE, "u-ops-cz");
    const { shipments } = await getDemo();
    expect(shipments.some((s) => s.id === "shp-1001")).toBe(false);
  });
});
