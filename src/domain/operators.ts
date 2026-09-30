import { z } from "zod";
import type { EtaWindow, NormalizedStatus, Operator, OperatorId, RawEvent } from "./types";

export const OPERATORS: Record<OperatorId, Operator> = {
  transvolta: { id: "transvolta", name: "Transvolta Road Freight", mode: "road", format: "numeric" },
  kestrel: { id: "kestrel", name: "Kestrel Express", mode: "road", format: "free-text" },
  bluemeridian: { id: "bluemeridian", name: "Blue Meridian Lines", mode: "sea", format: "port-event" },
  alpenweg: { id: "alpenweg", name: "Alpenweg Logistik", mode: "road", format: "short-code" },
};

export const PORT_NAMES: Record<string, string> = {
  ESVLC: "Port of Valencia",
  ESBCN: "Port of Barcelona",
  MXVER: "Port of Veracruz",
};

// --- Per-operator vocabularies ------------------------------------------------

/** Transvolta: numeric codes, epoch seconds. */
export const TRANSVOLTA_CODES: Record<number, NormalizedStatus> = {
  10: "booked",
  20: "picked_up",
  30: "in_transit",
  40: "customs_hold",
  45: "customs_cleared",
  50: "out_for_delivery",
  60: "delivered",
  90: "exception",
};

/** Kestrel: free text. First matching rule wins, so exceptions go first ("Not delivered" ≠ delivered). */
export const KESTREL_RULES: [RegExp, NormalizedStatus][] = [
  [/fail|not delivered|damaged|refused|address issue|lost/i, "exception"],
  [/delivered|signed by/i, "delivered"],
  [/out for delivery|with driver/i, "out_for_delivery"],
  [/customs.*(held|hold|inspection)/i, "customs_hold"],
  [/customs.*(released|cleared)/i, "customs_cleared"],
  [/collected|picked up/i, "picked_up"],
  [/in transit|departed|arrived at|received at|sorting/i, "in_transit"],
  [/label created|awaiting collection/i, "booked"],
];

/** Blue Meridian: port event codes with UN/LOCODEs. */
export const BLUEMERIDIAN_CODES: Record<string, NormalizedStatus> = {
  GIN: "at_port", // gate in at terminal
  LOD: "on_vessel", // loaded
  VDP: "on_vessel", // vessel departed
  POS: "on_vessel", // position / noon report at sea
  ANC: "at_port", // at anchorage, waiting for berth
  VAR: "at_port", // vessel arrived at berth
  DIS: "at_port", // discharged
  CHD: "customs_hold",
  CRL: "customs_cleared",
  GOT: "in_transit", // gate out, handed to next leg
};

/** Alpenweg: German short codes. */
export const ALPENWEG_CODES: Record<string, NormalizedStatus> = {
  AUF: "booked", // Auftrag erfasst
  ABH: "picked_up", // abgeholt
  UNT: "in_transit", // unterwegs
  ZOL: "customs_hold", // Zollhalt
  ZFR: "customs_cleared", // Zollfreigabe
  ZUS: "out_for_delivery", // in Zustellung
  ZUG: "delivered", // zugestellt
  STO: "exception", // Störung
};

// --- Raw payload schemas (trust boundary) -------------------------------------

// ponytail: operators with local-time formats are treated as UTC; add per-operator time zones for real feeds.
const dmyHm = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/;

const transvoltaSchema = z.object({ code: z.number().int(), ts: z.number().int().positive(), depot: z.string() });
const kestrelSchema = z.object({
  status: z.string().min(1),
  time: z.string().regex(dmyHm),
  city: z.string(),
  window: z.string().regex(/^\d{2}:\d{2}-\d{2}:\d{2}$/).optional(), // same day as `time`
});
const bluemeridianSchema = z.object({
  event: z.string().length(3),
  port: z.string().length(5),
  at: z.iso.datetime({ offset: true }),
  vessel: z.string().optional(),
  eta: z.iso.datetime({ offset: true }).optional(),
});
const alpenwegSchema = z.object({ st: z.string(), datum: z.string().regex(compact), ort: z.string(), txt: z.string().optional() });

// --- Normalization ------------------------------------------------------------

type Parsed = {
  rawCode?: string;
  rawStatus: string;
  status: NormalizedStatus;
  at: string;
  location?: string;
  eta?: EtaWindow;
};

const fromDmy = (s: string): string => {
  const [, d, m, y, hh, mm] = dmyHm.exec(s)!;
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`).toISOString();
};

const fromCompact = (s: string): string => {
  const [, y, m, d, hh, mm] = compact.exec(s)!;
  return new Date(`${y}-${m}-${d}T${hh}:${mm}:00Z`).toISOString();
};

const iso = (s: string) => new Date(s).toISOString();

const parsers: Record<OperatorId, (payload: unknown) => Parsed | null> = {
  transvolta(payload) {
    const r = transvoltaSchema.safeParse(payload);
    if (!r.success) return null;
    const { code, ts, depot } = r.data;
    return {
      rawCode: String(code),
      rawStatus: `Code ${code}`,
      status: TRANSVOLTA_CODES[code] ?? "unknown",
      at: new Date(ts * 1000).toISOString(),
      location: depot,
    };
  },
  kestrel(payload) {
    const r = kestrelSchema.safeParse(payload);
    if (!r.success) return null;
    const { status, time, city, window } = r.data;
    const at = fromDmy(time);
    const day = at.slice(0, 10);
    const [from, to] = window?.split("-") ?? [];
    return {
      rawStatus: status,
      status: KESTREL_RULES.find(([re]) => re.test(status))?.[1] ?? "unknown",
      at,
      location: city,
      eta: from && to ? { earliest: iso(`${day}T${from}:00Z`), latest: iso(`${day}T${to}:00Z`) } : undefined,
    };
  },
  bluemeridian(payload) {
    const r = bluemeridianSchema.safeParse(payload);
    if (!r.success) return null;
    const { event, port, at, vessel, eta } = r.data;
    return {
      rawCode: event,
      rawStatus: [event, port, vessel].filter(Boolean).join(" · "),
      status: BLUEMERIDIAN_CODES[event] ?? "unknown",
      at: iso(at),
      location: PORT_NAMES[port] ?? port,
      eta: eta ? { earliest: iso(eta), latest: iso(eta) } : undefined,
    };
  },
  alpenweg(payload) {
    const r = alpenwegSchema.safeParse(payload);
    if (!r.success) return null;
    const { st, datum, ort, txt } = r.data;
    return {
      rawCode: st,
      rawStatus: txt ? `${st} (${txt})` : st,
      status: ALPENWEG_CODES[st] ?? "unknown",
      at: fromCompact(datum),
      location: ort,
    };
  },
};

/** Validates and normalizes one raw operator message. Returns null if the payload is malformed. */
export const normalizeEvent = (event: RawEvent): Parsed | null => parsers[event.operatorId](event.payload);
