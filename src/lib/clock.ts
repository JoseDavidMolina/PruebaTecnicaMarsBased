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
