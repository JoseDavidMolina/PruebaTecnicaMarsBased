import { addHours, DEMO_NOW, zonedParts } from "@/lib/clock";
import { OPERATORS } from "@/domain/operators";
import { DOCUMENT_LABELS } from "@/domain/types";
import type { DocumentKind, OperatorId, Place, Position, RawEvent, Shipment, ShipmentDocument } from "@/domain/types";
import { CUSTOMERS, HUBS, PORTS, SITES } from "./reference";

// Times are hours relative to DEMO_NOW (negative = past).
const at = (h: number) => addHours(DEMO_NOW, h);
const pad = (n: number) => String(n).padStart(2, "0");
// Wall-clock time in the operator's zone, as operators without an offset in their format send it.
const local = (h: number, op: OperatorId) => {
  const t = zonedParts(at(h), OPERATORS[op].timeZone!);
  return { y: t.y, m: pad(t.m), d: pad(t.d), hh: pad(t.hh), mm: pad(t.mm) };
};

// --- Raw payloads, each in its operator's native format -----------------------

const tv = (code: number, h: number, depot: string) => ({ code, ts: Math.round(new Date(at(h)).getTime() / 1000), depot });

const ke = (status: string, h: number, city: string, window?: string) => {
  const t = local(h, "kestrel");
  return { status, time: `${t.d}/${t.m}/${t.y} ${t.hh}:${t.mm}`, city, ...(window && { window }) };
};

const bm = (event: string, h: number, port: string, vessel?: string, etaH?: number) => ({
  event,
  port,
  at: at(h),
  ...(vessel && { vessel }),
  ...(etaH !== undefined && { eta: at(etaH) }),
});

const aw = (st: string, h: number, ort: string, txt?: string) => {
  const t = local(h, "alpenweg");
  return { st, datum: `${t.y}${t.m}${t.d}${t.hh}${t.mm}`, ort, ...(txt && { txt }) };
};

// --- Shipment builder ---------------------------------------------------------

type LegSpec = { op: OperatorId; from: Place; to: Place; dep: number; arr: number; events: unknown[] };
type Spec = {
  n: number;
  order: string;
  site: string;
  customer: string;
  promised: number;
  legs: LegSpec[];
  docs?: Partial<Record<DocumentKind, ShipmentDocument["status"]>>;
  positions?: [lat: number, lng: number, minutesAgo: number][];
};

const NON_EU = ["GB", "MX"];
const site = (id: string) => SITES.find((s) => s.id === id)!;
const customer = (id: string) => CUSTOMERS.find((c) => c.id === id)!;
const operatorRef = (op: OperatorId, n: number, i: number) =>
  ({ transvolta: `7${n}${i}0042`, kestrel: `KX${n}${i}EU`, bluemeridian: `BMLU${n}${i}731`, alpenweg: `AW-${n}-${i}` })[op];

function build(spec: Spec): Shipment {
  const id = `shp-${spec.n}`;
  const reference = `SHP-${spec.n}`;
  const legs = spec.legs.map((l, i) => ({
    id: `${id}-L${i + 1}`,
    seq: i + 1,
    mode: OPERATORS[l.op].mode,
    operatorId: l.op,
    operatorRef: operatorRef(l.op, spec.n, i + 1),
    from: l.from,
    to: l.to,
    plannedDeparture: at(l.dep),
    plannedArrival: at(l.arr),
  }));
  const events: RawEvent[] = spec.legs.flatMap((l, i) => l.events.map((payload) => ({ legId: legs[i].id, operatorId: l.op, payload })));

  const destination = customer(spec.customer).place.country;
  const international = site(spec.site).place.country !== destination;
  const kinds: Partial<Record<DocumentKind, ShipmentDocument["status"]>> = {
    packing_list: "available",
    ...(legs.some((l) => l.mode === "road") && { cmr: "available" }),
    ...(legs.some((l) => l.mode === "sea") && { bill_of_lading: "available" }),
    ...(international && { commercial_invoice: "available" }),
    ...(NON_EU.includes(destination) && { customs_declaration: "available" }),
    ...spec.docs,
  };
  const documents = Object.entries(kinds).map(([kind, status]) => ({
    id: `${id}-${kind}`,
    kind: kind as DocumentKind,
    name: `${DOCUMENT_LABELS[kind as DocumentKind]} ${reference}.pdf`,
    status: status!,
  }));

  const positions: Position[] | undefined = spec.positions?.map(([lat, lng, min]) => ({ lat, lng, at: at(-min / 60) }));

  return {
    id,
    reference,
    orderRef: spec.order,
    originSiteId: spec.site,
    customerId: spec.customer,
    promisedDelivery: at(spec.promised),
    legs,
    events,
    documents,
    ...(positions && { positions }),
  };
}

const sitePlace = (id: string) => site(id).place;
const customerPlace = (id: string) => customer(id).place;
const POD = { proof_of_delivery: "available" } as const;

// --- The portfolio ------------------------------------------------------------

export const RAW_SHIPMENTS: Shipment[] = [
  // HERO 1: international, held at customs in Dover, commercial invoice missing.
  build({
    n: 1001, order: "PO-12345", site: "site-zgz", customer: "cust-arvenza-uk", promised: 12,
    docs: { commercial_invoice: "missing" },
    legs: [{
      op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-arvenza-uk"), dep: -96, arr: -12,
      events: [tv(10, -120, "Zaragoza"), tv(20, -96, "Zaragoza"), tv(30, -70, "Bordeaux"), tv(30, -44, "Calais"), tv(40, -30, "Dover"), tv(40, -6, "Dover")],
    }],
  }),

  // HERO 2: multimodal road → port → vessel → port → last mile, vessel waiting for a berth in Veracruz.
  build({
    n: 1002, order: "PO-12402", site: "site-zgz", customer: "cust-arvenza-mx", promised: 48,
    legs: [
      {
        op: "transvolta", from: sitePlace("site-zgz"), to: PORTS.valencia, dep: -480, arr: -470,
        events: [tv(10, -500, "Zaragoza"), tv(20, -480, "Zaragoza"), tv(60, -468, "Valencia port")],
      },
      {
        op: "bluemeridian", from: PORTS.valencia, to: PORTS.veracruz, dep: -430, arr: -48,
        events: [
          bm("GIN", -466, "ESVLC"),
          bm("LOD", -436, "ESVLC", "MV Aurora Tide"),
          bm("VDP", -430, "ESVLC", "MV Aurora Tide", -48),
          bm("POS", -200, "MXVER", "MV Aurora Tide", -44),
          bm("ANC", -40, "MXVER", "MV Aurora Tide", 30),
          bm("ANC", -10, "MXVER", "MV Aurora Tide", 54),
        ],
      },
      { op: "kestrel", from: PORTS.veracruz, to: customerPlace("cust-arvenza-mx"), dep: -24, arr: 24, events: [] },
    ],
  }),

  // HERO 3: stale. Alpenweg has been silent for almost 4 days.
  build({
    n: 1003, order: "PO-12377", site: "site-brno", customer: "cust-kaltberg", promised: 30,
    legs: [{
      op: "alpenweg", from: sitePlace("site-brno"), to: customerPlace("cust-kaltberg"), dep: -96, arr: 24,
      events: [aw("AUF", -120, "Brno", "Auftrag erfasst"), aw("ABH", -96, "Brno", "Abgeholt"), aw("UNT", -94, "Brno Hub", "Unterwegs")],
    }],
  }),

  // HERO 4: out for delivery in Lyon, with a courier delivery window and a live route.
  build({
    n: 1004, order: "PO-12410", site: "site-bcn", customer: "cust-solenne", promised: 11,
    legs: [
      {
        op: "transvolta", from: sitePlace("site-bcn"), to: HUBS.lyon, dep: -40, arr: -16,
        events: [tv(10, -60, "El Prat"), tv(20, -40, "El Prat"), tv(30, -28, "Perpignan"), tv(60, -16, "Lyon")],
      },
      {
        op: "kestrel", from: HUBS.lyon, to: customerPlace("cust-solenne"), dep: -3, arr: 10,
        events: [
          ke("Parcel received at Lyon depot", -14, "Corbas"),
          ke("Sorting completed", -5, "Corbas"),
          ke("Out for delivery - driver assigned", -2, "Lyon", "09:00-11:00"),
        ],
      },
    ],
    positions: [
      [45.6689, 4.8975, 115], [45.6801, 4.8903, 100], [45.6972, 4.8861, 85], [45.7115, 4.879, 70],
      [45.726, 4.8712, 55], [45.7378, 4.8695, 40], [45.7489, 4.8751, 25], [45.7581, 4.8823, 10],
    ],
  }),

  // HERO 5: delivered on time yesterday.
  build({
    n: 1005, order: "PO-12298", site: "site-zgz", customer: "cust-ribeira", promised: -14, docs: POD,
    legs: [{
      op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-ribeira"), dep: -76, arr: -22,
      events: [tv(10, -100, "Zaragoza"), tv(20, -76, "Zaragoza"), tv(30, -52, "Salamanca"), tv(50, -26, "Porto"), tv(60, -20, "Porto")],
    }],
  }),

  // --- Filler ---
  build({
    n: 1006, order: "PO-12415", site: "site-bcn", customer: "cust-meseta", promised: 10,
    legs: [{ op: "transvolta", from: sitePlace("site-bcn"), to: customerPlace("cust-meseta"), dep: -10, arr: 6,
      events: [tv(10, -30, "El Prat"), tv(20, -10, "El Prat"), tv(30, -3, "Zaragoza")] }],
  }),
  build({
    n: 1007, order: "PO-12260", site: "site-zgz", customer: "cust-meseta", promised: -94, docs: POD,
    legs: [{ op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-meseta"), dep: -106, arr: -98,
      events: [tv(10, -130, "Zaragoza"), tv(20, -106, "Zaragoza"), tv(30, -103, "Calatayud"), tv(50, -100, "Madrid"), tv(60, -98, "Madrid")] }],
  }),
  build({
    n: 1008, order: "PO-12421", site: "site-brno", customer: "cust-kaltberg", promised: 20,
    legs: [{ op: "alpenweg", from: sitePlace("site-brno"), to: customerPlace("cust-kaltberg"), dep: -14, arr: 10,
      events: [aw("AUF", -30, "Brno"), aw("ABH", -14, "Brno"), aw("UNT", -5, "Linz")] }],
  }),
  build({
    n: 1009, order: "PO-12433", site: "site-brno", customer: "cust-ostara", promised: 48,
    legs: [{ op: "alpenweg", from: sitePlace("site-brno"), to: customerPlace("cust-ostara"), dep: 6, arr: 40,
      events: [aw("AUF", -8, "Brno", "Auftrag erfasst")] }],
  }),
  build({
    n: 1010, order: "PO-12388", site: "site-bcn", customer: "cust-solenne", promised: 4,
    legs: [{ op: "kestrel", from: sitePlace("site-bcn"), to: customerPlace("cust-solenne"), dep: -30, arr: 4,
      events: [
        ke("Collected from shipper", -30, "El Prat"),
        ke("In transit - departed Barcelona hub", -26, "Barcelona"),
        ke("Arrived at Lyon depot", -12, "Corbas"),
        ke("Out for delivery", -6, "Lyon"),
        ke("Delivery attempt failed - recipient absent, next attempt next business day", -3, "Villeurbanne"),
      ] }],
  }),
  build({
    n: 1011, order: "PO-12402-B", site: "site-zgz", customer: "cust-ribeira", promised: 36,
    legs: [{ op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-ribeira"), dep: -20, arr: 28,
      events: [tv(10, -40, "Zaragoza"), tv(20, -20, "Zaragoza"), tv(30, -8, "Salamanca")] }],
  }),
  build({
    n: 1012, order: "PO-12356", site: "site-bcn", customer: "cust-arvenza-mx", promised: 216,
    legs: [
      { op: "transvolta", from: sitePlace("site-bcn"), to: PORTS.barcelona, dep: -150, arr: -146,
        events: [tv(10, -170, "El Prat"), tv(20, -150, "El Prat"), tv(60, -146, "Barcelona port")] },
      { op: "bluemeridian", from: PORTS.barcelona, to: PORTS.veracruz, dep: -120, arr: 150,
        events: [bm("GIN", -144, "ESBCN"), bm("LOD", -124, "ESBCN", "MV Selene Crest"), bm("VDP", -120, "ESBCN", "MV Selene Crest", 150), bm("POS", -20, "MXVER", "MV Selene Crest", 146)] },
      { op: "kestrel", from: PORTS.veracruz, to: customerPlace("cust-arvenza-mx"), dep: 160, arr: 200, events: [] },
    ],
  }),
  build({
    n: 1013, order: "PO-12201", site: "site-zgz", customer: "cust-arvenza-uk", promised: -140, docs: POD,
    legs: [{ op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-arvenza-uk"), dep: -220, arr: -150,
      events: [tv(10, -240, "Zaragoza"), tv(20, -220, "Zaragoza"), tv(30, -190, "Calais"), tv(40, -175, "Dover"), tv(45, -165, "Dover"), tv(50, -152, "Birmingham"), tv(60, -150, "Birmingham")] }],
  }),
  build({
    n: 1014, order: "PO-12418", site: "site-brno", customer: "cust-solenne", promised: 30,
    legs: [{ op: "alpenweg", from: sitePlace("site-brno"), to: customerPlace("cust-solenne"), dep: -30, arr: 20,
      // X7 is not in Alpenweg's documented vocabulary: must surface as "unknown", not be guessed.
      events: [aw("AUF", -50, "Brno"), aw("ABH", -30, "Brno"), aw("UNT", -20, "Nürnberg"), aw("X7", -6, "Strasbourg", "Umladung")] }],
  }),
  build({
    n: 1015, order: "PO-12399", site: "site-bcn", customer: "cust-ostara", promised: 6, docs: POD,
    legs: [{ op: "kestrel", from: sitePlace("site-bcn"), to: customerPlace("cust-ostara"), dep: -40, arr: -1,
      events: [
        ke("Collected from shipper", -40, "El Prat"),
        ke("In transit - departed Barcelona hub", -36, "Barcelona"),
        ke("Arrived at Milan depot", -12, "Milano"),
        ke("Out for delivery", -5, "Milano"),
        ke("Delivered - signed by M. Rossi", -2, "Milano"),
      ] }],
  }),
  build({
    n: 1016, order: "PO-12390", site: "site-zgz", customer: "cust-kaltberg", promised: 4,
    legs: [{ op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-kaltberg"), dep: -44, arr: -2,
      events: [tv(10, -60, "Zaragoza"), tv(20, -44, "Zaragoza"), tv(30, -20, "Mulhouse"), tv(30, -4, "Stuttgart")] }],
  }),
  build({
    n: 1017, order: "PO-12411", site: "site-brno", customer: "cust-ribeira", promised: 60,
    legs: [{ op: "alpenweg", from: sitePlace("site-brno"), to: customerPlace("cust-ribeira"), dep: -50, arr: 46,
      events: [aw("AUF", -70, "Brno"), aw("ABH", -50, "Brno"), aw("UNT", -30, "Nürnberg"), aw("UNT", -8, "Lyon")] }],
  }),
  build({
    n: 1018, order: "PO-12334", site: "site-bcn", customer: "cust-meseta", promised: -44, docs: POD,
    legs: [{ op: "transvolta", from: sitePlace("site-bcn"), to: customerPlace("cust-meseta"), dep: -60, arr: -48,
      events: [tv(10, -80, "El Prat"), tv(20, -60, "El Prat"), tv(30, -55, "Zaragoza"), tv(50, -50, "Madrid"), tv(60, -48, "Madrid")] }],
  }),
  build({
    n: 1019, order: "PO-12440", site: "site-zgz", customer: "cust-solenne", promised: 60,
    legs: [{ op: "transvolta", from: sitePlace("site-zgz"), to: customerPlace("cust-solenne"), dep: 20, arr: 50,
      events: [tv(10, -4, "Zaragoza")] }],
  }),
  build({
    n: 1020, order: "PO-12310", site: "site-brno", customer: "cust-kaltberg", promised: -80, docs: POD,
    legs: [{ op: "alpenweg", from: sitePlace("site-brno"), to: customerPlace("cust-kaltberg"), dep: -110, arr: -80,
      events: [
        aw("AUF", -130, "Brno"), aw("ABH", -110, "Brno"), aw("UNT", -100, "Passau"),
        aw("STO", -90, "Regensburg", "Fahrzeugschaden"), aw("UNT", -70, "Regensburg"),
        aw("ZUS", -66, "München"), aw("ZUG", -62, "München", "Zugestellt"),
      ] }],
  }),
];

/**
 * The next message each hero operator will send, used by "simulate operator update".
 * Timestamped at DEMO_NOW so the demo stays deterministic.
 */
export const SIMULATED_UPDATES: Record<string, RawEvent> = {
  "shp-1001": { legId: "shp-1001-L1", operatorId: "transvolta", payload: tv(45, 0, "Dover") },
  "shp-1002": { legId: "shp-1002-L2", operatorId: "bluemeridian", payload: bm("VAR", 0, "MXVER", "MV Aurora Tide", 12) },
  "shp-1003": { legId: "shp-1003-L1", operatorId: "alpenweg", payload: aw("UNT", 0, "Passau", "Unterwegs") },
  "shp-1004": { legId: "shp-1004-L2", operatorId: "kestrel", payload: ke("Delivered - signed by C. Dubois", 0, "Villeurbanne") },
};
