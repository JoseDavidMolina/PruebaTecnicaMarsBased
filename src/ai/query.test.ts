import { describe, expect, it } from "vitest";
import { SHIPMENTS } from "@/data";
import { matchQuery, parseQuery } from "./query";
import { factsFor } from "./service";

const search = (text: string) => {
  const q = parseQuery(text);
  return SHIPMENTS.filter((s) => matchQuery(q, factsFor(s))).map((s) => s.id);
};

describe("parseQuery", () => {
  it("understands destination, lateness and a date window", () => {
    const q = parseQuery("shipments to France this week running late");
    expect(q).toMatchObject({
      countries: ["FR"],
      flags: ["late"],
      eta: { from: "2026-10-05T00:00:00.000Z", to: "2026-10-12T00:00:00.000Z" }, // Monday to Monday
      unparsed: [],
    });
    expect(q.interpretedAs).toEqual(["Arriving this week", "Running late", "To France"]);
  });

  it("extracts an order reference from a question", () => {
    expect(parseQuery("What's going on with order 12345?")).toMatchObject({ ref: "12345", unparsed: [] });
    expect(parseQuery("SHP-1002").ref).toBe("1002");
  });

  it("combines status and flag from one phrase", () => {
    expect(parseQuery("sea shipments delayed at port")).toMatchObject({ mode: "sea", statuses: ["at_port"], flags: ["late"] });
    expect(parseQuery("held at customs").statuses).toEqual(["customs_hold"]);
  });

  it("recognises operators, origin sites and customers", () => {
    expect(parseQuery("Alpenweg shipments from Brno")).toMatchObject({ operatorIds: ["alpenweg"], siteIds: ["site-brno"] });
    expect(parseQuery("anything for Arvenza").customerIds).toEqual(["cust-arvenza-uk", "cust-arvenza-mx"]);
  });

  it("reports the words it did not understand instead of guessing", () => {
    expect(parseQuery("shipments to Narnia by dragon").unparsed).toEqual(["narnia", "dragon"]);
  });
});

describe("matchQuery", () => {
  it("answers the brief's example questions", () => {
    expect(search("shipments to France this week running late")).toEqual(["shp-1010"]);
    expect(search("what's going on with order 12345?")).toEqual(["shp-1001"]);
  });

  it("filters by derived facts", () => {
    expect(search("stale")).toEqual(["shp-1003"]);
    expect(search("at risk from Brno")).toEqual(["shp-1003"]);
    expect(search("delivered today")).toEqual(["shp-1015"]);
  });
});
