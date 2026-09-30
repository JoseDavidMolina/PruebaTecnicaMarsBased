import { track } from "@/domain/timeline";
import type { Customer, Site, TrackedShipment } from "@/domain/types";
import { CUSTOMERS, SITES } from "./reference";
import { RAW_SHIPMENTS, SIMULATED_UPDATES } from "./shipments";

export { CUSTOMERS, SITES, USERS } from "./reference";
export { SIMULATED_UPDATES };

/** Raw operator events validated and normalized once, at load. */
export const SHIPMENTS: TrackedShipment[] = RAW_SHIPMENTS.map(track);

/** The shipment as it looks after its operator sends the scripted next update. */
export const withSimulatedUpdate = (s: TrackedShipment): TrackedShipment =>
  SIMULATED_UPDATES[s.id] ? track({ ...s, events: [...s.events, SIMULATED_UPDATES[s.id]] }) : s;

export const getShipment =(id: string): TrackedShipment | undefined => SHIPMENTS.find((s) => s.id === id);
export const siteOf = (s: { originSiteId: string }): Site => SITES.find((x) => x.id === s.originSiteId)!;
export const customerOf = (s: { customerId: string }): Customer => CUSTOMERS.find((x) => x.id === s.customerId)!;
