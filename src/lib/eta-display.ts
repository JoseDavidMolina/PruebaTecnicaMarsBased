import { isLate } from "@/ai/eta";
import type { EtaPrediction } from "@/ai/types";
import { DEMO_NOW, formatDate, formatDateRange, formatDateTime, formatDuration, formatTime, isSameDay, zoneName } from "./clock";

const dayLabel = (iso: string, now: Date) => (isSameDay(iso, now) ? "Today" : formatDate(iso));

/** Human wording of an ETA: an exact moment, a delivery window, or an estimated range. */
export function etaText(eta: EtaPrediction, delivered: boolean, now: Date = DEMO_NOW): { main: string; sub?: string } {
  if (delivered) return { main: `Delivered ${formatDateTime(eta.expected)} ${zoneName(eta.expected)}` };
  if (eta.reliability === "confirmed") {
    return { main: `${dayLabel(eta.earliest, now)}, ${formatTime(eta.earliest)}–${formatTime(eta.latest)} ${zoneName(eta.latest)}` };
  }
  const range = formatDateRange(eta.earliest, eta.latest);
  // A time of day is only as precise as the estimate: shown for a high-confidence estimate that is late by hours
  // (the day alone can match the promised day), otherwise the day and its range.
  const precise = eta.confidence === "high" && isLate(eta) && eta.delayHours < 24;
  const main = precise ? `${dayLabel(eta.expected, now)}, ${formatTime(eta.expected)} ${zoneName(eta.expected)}` : dayLabel(eta.expected, now);
  return { main, sub: range.includes("–") ? `Range ${range}` : undefined };
}

export type DelayNote = { kind: "late" | "unconfirmed" | "on_time"; text: string };

/** Stale data can show a delay, but never "On time": that would only echo the plan back. */
export function delayNote(eta: EtaPrediction, stale: boolean): DelayNote {
  if (isLate(eta)) return { kind: "late", text: `${formatDuration(eta.delayHours)} late` };
  if (stale) return { kind: "unconfirmed", text: "Unconfirmed" };
  return { kind: "on_time", text: "On time" };
}
