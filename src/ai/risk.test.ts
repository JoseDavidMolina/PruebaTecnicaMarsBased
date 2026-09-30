import { describe, expect, it } from "vitest";
import { addHours, DEMO_NOW } from "@/lib/clock";
import { track } from "@/domain/timeline";
import { getShipment, SHIPMENTS, SIMULATED_UPDATES } from "@/data";
import { assessRisk } from "./risk";

const risk = (id: string) => assessRisk(getShipment(id)!);

describe("assessRisk", () => {
  it("scores the customs hold with a missing invoice as high risk", () => {
    const r = risk("shp-1001");
    expect(r.level).toBe("high");
    expect(r.flags).toEqual(expect.arrayContaining(["customs_hold", "missing_document", "late"]));
    expect(r.reasons.join(" ")).toMatch(/Dover/);
  });

  it("flags the vessel waiting at port", () => {
    const r = risk("shp-1002");
    expect(r.level).toBe("high");
    expect(r.flags).toEqual(["port_delay", "late"]);
  });

  it("flags stale data", () => {
    expect(risk("shp-1003")).toMatchObject({ level: "medium", flags: ["stale"] });
  });

  it("flags an unrecognised operator code without raising it to the attention queue", () => {
    expect(risk("shp-1014")).toMatchObject({ level: "low", flags: ["unrecognised_update"] });
  });

  it("gives zero risk once delivered and low risk when on track", () => {
    expect(risk("shp-1005")).toEqual({ score: 0, level: "low", flags: [], reasons: [] });
    expect(risk("shp-1006")).toMatchObject({ level: "low", flags: [] });
    expect(risk("shp-1004").level).toBe("low");
  });

  it("surfaces exactly the shipments that need attention, worst first", () => {
    const ranked = SHIPMENTS.map((s) => ({ id: s.id, r: assessRisk(s) }))
      .filter(({ r }) => r.level !== "low")
      .sort((a, b) => b.r.score - a.r.score)
      .map(({ id }) => id);
    expect(ranked).toEqual(["shp-1001", "shp-1010", "shp-1002", "shp-1003", "shp-1016"]);
  });

  it("drops when the customs hold is released", () => {
    const s = getShipment("shp-1001")!;
    const updated = track({ ...s, events: [...s.events, SIMULATED_UPDATES["shp-1001"]] });
    expect(assessRisk(updated).score).toBeLessThan(risk("shp-1001").score);
    expect(assessRisk(updated).flags).not.toContain("customs_hold");
  });

  it("becomes stale as time passes without updates", () => {
    expect(assessRisk(getShipment("shp-1006")!, new Date(addHours(DEMO_NOW, 30))).flags).toContain("stale");
  });
});
