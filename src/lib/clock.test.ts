import { describe, expect, it } from "vitest";
import { formatAgo, formatDuration, zoneName } from "./clock";

describe("formatDuration", () => {
  it("rounds delays to whole hours under a day, then to days, and never says 0", () => {
    expect(formatDuration(0)).toBe("1 hour");
    expect(formatDuration(1)).toBe("1 hour");
    expect(formatDuration(1.6)).toBe("2 hours");
    expect(formatDuration(23)).toBe("23 hours");
    expect(formatDuration(24)).toBe("1 day");
    expect(formatDuration(47)).toBe("2 days");
    expect(formatDuration(-7)).toBe("7 hours");
  });
});

describe("zoneName", () => {
  it("names the Madrid zone of that instant, summer or winter time", () => {
    expect(zoneName("2026-10-07T07:00:00Z")).toBe("CEST");
    expect(zoneName("2026-10-26T07:00:00Z")).toBe("CET"); // clocks went back on 25 Oct
  });
});

describe("formatAgo", () => {
  it("says 'just now' for an update received less than an hour ago", () => {
    expect(formatAgo(0)).toBe("just now");
    expect(formatAgo(0.99)).toBe("just now");
  });

  it("counts hours and days from one hour on", () => {
    expect(formatAgo(1)).toBe("1 hour ago");
    expect(formatAgo(5)).toBe("5 hours ago");
    expect(formatAgo(94)).toBe("4 days ago");
  });
});
