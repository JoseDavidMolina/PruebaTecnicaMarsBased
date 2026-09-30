import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/clock";
import { normalizeEvent } from "./operators";
import type { OperatorId } from "./types";

const ev = (operatorId: OperatorId, payload: unknown) => normalizeEvent({ legId: "L1", operatorId, payload });

describe("normalizeEvent", () => {
  it("maps Transvolta numeric codes and epoch timestamps", () => {
    expect(ev("transvolta", { code: 40, ts: 1_791_356_400, depot: "Dover" })).toEqual({
      rawCode: "40",
      rawStatus: "Code 40",
      status: "customs_hold",
      at: "2026-10-07T07:00:00.000Z",
      location: "Dover",
    });
  });

  it("parses Kestrel free text and its delivery window in Paris local time", () => {
    const m = ev("kestrel", {
      status: "Out for delivery - driver assigned",
      time: "07/10/2026 05:10",
      city: "Lyon",
      window: "09:00-11:00",
    });
    expect(m?.status).toBe("out_for_delivery");
    expect(m?.at).toBe("2026-10-07T03:10:00.000Z"); // CEST, UTC+2
    expect(m?.eta).toEqual({ earliest: "2026-10-07T07:00:00.000Z", latest: "2026-10-07T09:00:00.000Z" });
  });

  it("displays a Kestrel delivery window exactly as the operator wrote it", () => {
    const m = ev("kestrel", { status: "Out for delivery", time: "07/10/2026 05:10", city: "Lyon", window: "09:00-11:00" });
    expect([formatTime(m!.eta!.earliest), formatTime(m!.eta!.latest)]).toEqual(["09:00", "11:00"]);
  });

  it("reads local times on both sides of the October DST switch", () => {
    const at = (time: string) => ev("kestrel", { status: "Sorting completed", time, city: "Lyon" })?.at;
    expect(at("24/10/2026 10:00")).toBe("2026-10-24T08:00:00.000Z"); // CEST, UTC+2
    expect(at("25/10/2026 01:30")).toBe("2026-10-24T23:30:00.000Z"); // before 03:00 CEST becomes 02:00 CET
    expect(at("25/10/2026 03:30")).toBe("2026-10-25T02:30:00.000Z"); // CET, UTC+1
    expect(at("26/10/2026 10:00")).toBe("2026-10-26T09:00:00.000Z");
    expect(ev("alpenweg", { st: "UNT", datum: "202610251200", ort: "Linz" })?.at).toBe("2026-10-25T11:00:00.000Z");
  });

  it("checks Kestrel exceptions before deliveries", () => {
    const status = (s: string) => ev("kestrel", { status: s, time: "07/10/2026 05:10", city: "Lyon" })?.status;
    expect(status("Delivery attempt failed - recipient absent")).toBe("exception");
    expect(status("Not delivered: address issue")).toBe("exception");
    expect(status("Delivered - signed by J. Doe")).toBe("delivered");
    expect(status("Parcel received at Lyon depot")).toBe("in_transit");
  });

  it("maps Blue Meridian port events and reads the vessel ETA", () => {
    const m = ev("bluemeridian", {
      event: "ANC",
      port: "MXVER",
      at: "2026-10-06T21:00:00-06:00",
      vessel: "MV Aurora Tide",
      eta: "2026-10-09T12:00:00-06:00",
    });
    expect(m).toMatchObject({ status: "at_port", rawCode: "ANC", location: "Port of Veracruz", at: "2026-10-07T03:00:00.000Z" });
    expect(m?.eta?.latest).toBe("2026-10-09T18:00:00.000Z");
  });

  it("maps Alpenweg short codes with compact dates in Vienna local time", () => {
    expect(ev("alpenweg", { st: "UNT", datum: "202610031400", ort: "Linz", txt: "Unterwegs" })).toMatchObject({
      status: "in_transit",
      rawStatus: "UNT (Unterwegs)",
      at: "2026-10-03T12:00:00.000Z",
    });
  });

  it("never guesses: unmapped codes become unknown and keep the raw value", () => {
    expect(ev("transvolta", { code: 77, ts: 1_791_356_400, depot: "Zaragoza" })).toMatchObject({ status: "unknown", rawCode: "77" });
    expect(ev("kestrel", { status: "Handed to partner network", time: "07/10/2026 05:10", city: "Lyon" })?.status).toBe("unknown");
  });

  it("rejects malformed payloads", () => {
    expect(ev("transvolta", { code: "40", ts: 1 })).toBeNull();
    expect(ev("kestrel", { status: "Delivered", time: "2026-10-07", city: "Lyon" })).toBeNull();
    expect(ev("bluemeridian", null)).toBeNull();
  });
});
