import { track } from "@/domain/timeline";
import type { Customer, RawEvent, Site, TrackedShipment } from "@/domain/types";
import { CUSTOMERS, SITES } from "./reference";
import { RAW_SHIPMENTS, SIMULATED_UPDATES, SIMULATED_WHILE_FILE_INCOMPLETE } from "./shipments";

export { CUSTOMERS, SITES, USERS } from "./reference";
export { SIMULATED_UPDATES };

export const SHIPMENTS: TrackedShipment[] = RAW_SHIPMENTS.map(track);

/** The operator's next message, which can depend on the shipment's file (see SIMULATED_WHILE_FILE_INCOMPLETE). */
const nextOperatorEvent = (s: TrackedShipment): RawEvent | undefined =>
  (s.documents.some((d) => d.status === "missing") && SIMULATED_WHILE_FILE_INCOMPLETE[s.id]) || SIMULATED_UPDATES[s.id];

export const withSimulatedUpdate = (s: TrackedShipment): TrackedShipment => {
  const event = nextOperatorEvent(s);
  return event ? track({ ...s, events: [...s.events, event] }) : s;
};


export const withUploadedDocuments = (s: TrackedShipment): TrackedShipment => ({
  ...s,
  documents: s.documents.map((d) => ({ ...d, status: "available" })),
});

export const getShipment =(id: string): TrackedShipment | undefined => SHIPMENTS.find((s) => s.id === id);
export const siteOf = (s: { originSiteId: string }): Site => SITES.find((x) => x.id === s.originSiteId)!;
export const customerOf = (s: { customerId: string }): Customer => CUSTOMERS.find((x) => x.id === s.customerId)!;
