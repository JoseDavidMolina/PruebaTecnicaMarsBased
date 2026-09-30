export type Mode = "road" | "sea";

/** Who says so: the operator reported it, or we computed it. */
export type Reliability = "confirmed" | "estimated";

/** How sure an estimate is. Independent from Reliability. */
export type Confidence = "high" | "medium" | "low";

export type OperatorId = "transvolta" | "kestrel" | "bluemeridian" | "alpenweg";

export type Place = {
  name: string;
  country: string; // ISO 3166-1 alpha-2
  lat: number;
  lng: number;
  portCode?: string; // UN/LOCODE
};

export type Site = { id: string; name: string; kind: "factory" | "warehouse"; place: Place };

export type Customer = { id: string; name: string; kind: "customer" | "subsidiary"; place: Place };

export type Operator = {
  id: OperatorId;
  name: string;
  mode: Mode;
  format: "numeric" | "free-text" | "port-event" | "short-code";
};

export type User =
  | { id: string; name: string; role: "ops"; siteIds: string[] }
  | { id: string; name: string; role: "customer"; customerId: string };

export const NORMALIZED_STATUSES = [
  "booked",
  "picked_up",
  "in_transit",
  "at_port",
  "on_vessel",
  "customs_hold",
  "customs_cleared",
  "out_for_delivery",
  "delivered",
  "exception",
  "unknown", // operator code we cannot map: shown raw, never guessed
] as const;

export type NormalizedStatus = (typeof NORMALIZED_STATUSES)[number];

export type Leg = {
  id: string;
  seq: number;
  mode: Mode;
  operatorId: OperatorId;
  operatorRef: string; // tracking number in the operator's own system
  from: Place;
  to: Place;
  plannedDeparture: string;
  plannedArrival: string;
};

/** A message exactly as an operator sent it. The payload is untrusted until validated. */
export type RawEvent = { legId: string; operatorId: OperatorId; payload: unknown };

export type EtaWindow = { earliest: string; latest: string };

export type Milestone = {
  id: string;
  legId: string;
  operatorId: OperatorId;
  rawCode?: string;
  rawStatus: string;
  status: NormalizedStatus;
  at: string;
  location?: string;
  eta?: EtaWindow; // operator-reported arrival for this leg
  reliability: Reliability;
};

export type DocumentKind =
  | "commercial_invoice"
  | "packing_list"
  | "cmr"
  | "bill_of_lading"
  | "customs_declaration"
  | "proof_of_delivery";

export type ShipmentDocument = {
  id: string;
  kind: DocumentKind;
  name: string;
  status: "available" | "missing";
};

export type Position = { lat: number; lng: number; at: string };

export type Shipment = {
  id: string;
  reference: string;
  orderRef: string;
  originSiteId: string;
  customerId: string; // destination is the customer's place
  promisedDelivery: string;
  legs: Leg[];
  events: RawEvent[];
  documents: ShipmentDocument[];
  positions?: Position[]; // only while out for delivery
};

export type TrackedShipment = Shipment & {
  milestones: Milestone[]; // confirmed, sorted by time
  invalidEvents: RawEvent[]; // payloads that failed validation, kept for traceability
};
