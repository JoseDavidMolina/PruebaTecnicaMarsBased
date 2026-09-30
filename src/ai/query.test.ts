import { describe, expect, it } from "vitest";
import { SHIPMENTS } from "@/data";
import { dateWindow, matchQuery, parseQuery } from "./query";
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
      eta: { from: "2026-10-04T22:00:00.000Z", to: "2026-10-11T22:00:00.000Z" }, // Monday to Monday, Madrid time
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
    expect(parseQuery("anything for Oskendra").customerIds).toEqual(["cust-oskendra-uk", "cust-oskendra-mx"]);
  });

  it("reports the words it did not understand instead of guessing", () => {
    expect(parseQuery("shipments to Narnia by dragon").unparsed).toEqual(["narnia", "dragon"]);
  });

  it("understands plural modes and treats filler words as filler", () => {
    expect(parseQuery("trucks from Zaragoza")).toMatchObject({ mode: "road", siteIds: ["site-zgz"], unparsed: [] });
    expect(parseQuery("vessels").mode).toBe("sea");
    expect(parseQuery("ships arriving next week")).toMatchObject({ mode: "sea", unparsed: [] });
    expect(parseQuery("shipments that are due today").unparsed).toEqual([]);
  });

  it("reads 'not late' as on time, not as late", () => {
    expect(parseQuery("not late").flags).toEqual(["on_time"]);
    expect(parseQuery("on schedule").flags).toEqual(["on_time"]);
  });

  it("tolerates one typo in a country or operator name and says so in the chip", () => {
    const q = parseQuery("shipmnts to Frnace runing late");
    expect(q).toMatchObject({ countries: ["FR"], flags: ["late"], unparsed: ["shipmnts", "runing"] });
    expect(q.interpretedAs).toContain("To France (from 'frnace')");
    expect(parseQuery("transvota").operatorIds).toEqual(["transvolta"]);
    expect(parseQuery("spin").countries).toEqual([]); // short words are never stretched to a name
  });

  it.each([
    ["frnace", "To France"],
    ["alpenwg", "Alpenweg Logistik"],
    ["transvola", "Transvolta Road Freight"],
    ["mexcio", "To Mexico"],
    ["portgual", "To Portugal"],
    ["portugese", "To Portugal"],
    ["britian", "To United Kingdom"],
    ["meridain", "Blue Meridian Lines"],
  ])("reads the typo '%s' as %s", (typo, label) => {
    expect(parseQuery(`${typo} shipments`).interpretedAs).toEqual([`${label} (from '${typo}')`]);
  });

  // Real words one edit from a name, and short near-misses: never stretched to a country or operator.
  it.each(["germane", "brutish", "trench", "wrench", "prance", "trance", "untied", "stain", "slain", "franc", "unite"])(
    "leaves the real word '%s' alone",
    (w) => {
      const q = parseQuery(`${w} shipments`);
      expect(q).toMatchObject({ countries: [], operatorIds: [], interpretedAs: [], unparsed: [w] });
    },
  );
});

describe("dateWindow", () => {
  const range = (text: string, now: string) => dateWindow(text, new Date(now))?.range;

  it("uses the Madrid calendar day, not the UTC one", () => {
    // 23:30 UTC on 7 Oct is already 01:30 on 8 Oct in Madrid.
    expect(range("today", "2026-10-07T23:30:00Z")).toEqual({ from: "2026-10-07T22:00:00.000Z", to: "2026-10-08T22:00:00.000Z" });
    expect(range("tomorrow", "2026-10-07T21:30:00Z")).toEqual({ from: "2026-10-07T22:00:00.000Z", to: "2026-10-08T22:00:00.000Z" });
  });

  it("starts the week on Monday in Madrid, across the DST switch", () => {
    // Sunday 11 Oct 22:30 UTC is Monday 12 Oct in Madrid: a new week.
    expect(range("this week", "2026-10-11T22:30:00Z")).toEqual({ from: "2026-10-11T22:00:00.000Z", to: "2026-10-18T22:00:00.000Z" });
    // The week of 19 Oct ends after clocks go back on 25 Oct: Monday 26 Oct starts at 23:00 UTC.
    expect(range("this week", "2026-10-21T10:00:00Z")).toEqual({ from: "2026-10-18T22:00:00.000Z", to: "2026-10-25T23:00:00.000Z" });
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

  it("matches nothing when it understood nothing", () => {
    expect(search("shipments to Narnia by dragon")).toEqual([]);
  });

  it("finds open shipments that are neither late nor stale for 'on time'", () => {
    const onTime = ["shp-1004", "shp-1006", "shp-1008", "shp-1009", "shp-1011", "shp-1012", "shp-1014", "shp-1017", "shp-1019"];
    expect(search("on time")).toEqual(onTime);
    expect(search("not late")).toEqual(onTime);
  });

  it("uses every word of 'trucks from Zaragoza'", () => {
    expect(search("trucks from Zaragoza")).toEqual([
      "shp-1001",
      "shp-1002",
      "shp-1005",
      "shp-1007",
      "shp-1011",
      "shp-1013",
      "shp-1016",
      "shp-1019",
    ]);
  });
});
