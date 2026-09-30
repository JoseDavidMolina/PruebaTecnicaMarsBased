import { describe, expect, it } from "vitest";
import type { EtaPrediction } from "@/ai/types";
import { delayNote, etaText } from "./eta-display";

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
const onTime: EtaPrediction = { ...late, delayHours: 0 };

describe("etaText", () => {
  it("shows a time of day only for a high-confidence estimate", () => {
    expect(etaText(late, false).main).toBe("Today, 19:30 CEST");
    expect(etaText({ ...late, confidence: "medium" }, false)).toEqual({ main: "Today", sub: "Range 7 Oct – 8 Oct" });
  });

  it("shows the day, not a time, when the estimate is on time or a day or more late", () => {
    expect(etaText(onTime, false).main).toBe("Today");
    expect(etaText({ ...late, delayHours: 30 }, false).main).toBe("Today");
  });

  it("drops the range when it fits in one day, and names other days by date", () => {
    const tomorrow = { ...onTime, expected: "2026-10-08T10:00:00.000Z", earliest: "2026-10-08T08:00:00.000Z", latest: "2026-10-08T14:00:00.000Z" };
    expect(etaText(tomorrow, false)).toEqual({ main: "8 Oct", sub: undefined });
  });

  it("always shows the window the operator confirmed", () => {
    const window = { ...late, reliability: "confirmed" as const, earliest: "2026-10-07T07:00:00.000Z", latest: "2026-10-07T09:00:00.000Z" };
    expect(etaText(window, false).main).toBe("Today, 09:00–11:00 CEST");
  });

  it("says when it was delivered, whatever the estimate said", () => {
    expect(etaText(late, true)).toEqual({ main: "Delivered 7 Oct, 19:30 CEST" });
  });
});

describe("delayNote", () => {
  it("shows the delay, even on stale data", () => {
    expect(delayNote(late, false)).toEqual({ kind: "late", text: "7 hours late" });
    expect(delayNote(late, true)).toEqual({ kind: "late", text: "7 hours late" });
  });

  it("never says 'On time' when the data is stale", () => {
    expect(delayNote(onTime, true)).toEqual({ kind: "unconfirmed", text: "Unconfirmed" });
    expect(delayNote(onTime, false)).toEqual({ kind: "on_time", text: "On time" });
  });

  it("allows the 2-hour tolerance before calling it late", () => {
    expect(delayNote({ ...late, delayHours: 2 }, false).kind).toBe("on_time");
    expect(delayNote({ ...late, delayHours: 3 }, false).kind).toBe("late");
  });
});
