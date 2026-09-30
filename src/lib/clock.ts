// The only "now" in the app: the demo must look identical whenever it runs.
export const DEMO_NOW = new Date("2026-10-07T07:00:00Z");

// Fixed display zone so rendering does not depend on the viewer's machine.
export const DISPLAY_TZ = "Europe/Madrid";

const HOUR = 3_600_000;

export const hoursBetween = (from: string | Date, to: string | Date = DEMO_NOW): number =>
  (new Date(to).getTime() - new Date(from).getTime()) / HOUR;

export const addHours = (date: string | Date, hours: number): string =>
  new Date(new Date(date).getTime() + hours * HOUR).toISOString();

export const formatDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: DISPLAY_TZ }).format(new Date(iso));

export const formatTime = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TZ }).format(new Date(iso));

export const formatDateRange = (from: string, to: string): string => {
  const [a, b] = [formatDate(from), formatDate(to)];
  return a === b ? a : `${a} – ${b}`;
};

/** "7 hours", "2 days": for delays shown to people. */
export const formatDuration = (hours: number): string => {
  const h = Math.abs(hours);
  if (h < 24) {
    const n = Math.max(1, Math.round(h));
    return `${n} hour${n === 1 ? "" : "s"}`;
  }
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};

export const formatDateTime = (iso: string): string => `${formatDate(iso)}, ${formatTime(iso)}`;

export const formatLongDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: DISPLAY_TZ }).format(new Date(iso));

export type WallClock = { y: number; m: number; d: number; hh: number; mm: number };

/** The wall-clock reading of an instant in an IANA time zone. */
export function zonedParts(date: string | Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric",
  }).formatToParts(new Date(date));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)!.value);
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour"), mm: get("minute") };
}

const MINUTE = 60_000;
const offsetMinutes = (utcMs: number, timeZone: string) => {
  const p = zonedParts(new Date(utcMs), timeZone);
  return (Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) - Math.floor(utcMs / MINUTE) * MINUTE) / MINUTE;
};

/**
 * The instant a local wall-clock time refers to, DST included. Day overflow is allowed (d + 1).
 * The second pass corrects a first guess that fell on the other side of a DST switch;
 * a time repeated when clocks go back resolves to its later (winter-time) occurrence.
 */
export function fromZoned({ y, m, d, hh, mm }: WallClock, timeZone: string): string {
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  const first = asUtc - offsetMinutes(asUtc, timeZone) * MINUTE;
  return new Date(asUtc - offsetMinutes(first, timeZone) * MINUTE).toISOString();
}

export const isSameDay =(a: string | Date, b: string | Date): boolean =>
  formatDate(new Date(a).toISOString()) === formatDate(new Date(b).toISOString());
