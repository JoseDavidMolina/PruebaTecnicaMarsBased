import { describe, expect, it } from "vitest";
import type { EtaPrediction } from "@/ai/types";
import { etaText } from "./shipment-bits";

// Late by 7 hours, ending today (Madrid): 19:30.
const late: EtaPrediction = {
  expected: "2026-10-07T17:30:00.000Z",
  earliest: "2026-10-07T14:30:00.000Z",
  latest: "2026-10-07T23:30:00.000Z",
  reliability: "estimated",
  confidence: "high",
  delayHours: 7,
  explanation: "",
};

describe("etaText", () => {
  it("shows a time of day only for a high-confidence estimate", () => {
    expect(etaText(late, false).main).toBe("Today, 19:30");
    expect(etaText({ ...late, confidence: "medium" }, false)).toEqual({ main: "Today", sub: "Range 7 Oct – 8 Oct" });
  });

  it("always shows the window the operator confirmed", () => {
    expect(etaText({ ...late, reliability: "confirmed", confidence: "high", earliest: "2026-10-07T07:00:00.000Z", latest: "2026-10-07T09:00:00.000Z" }, false).main).toBe(
      "Today, 09:00–11:00",
    );
  });
});
