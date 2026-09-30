import { track } from "@/domain/timeline";
import type { Customer, Site, TrackedShipment } from "@/domain/types";
import { CUSTOMERS, SITES } from "./reference";
import { RAW_SHIPMENTS } from "./shipments";

export { CUSTOMERS, SITES, USERS } from "./reference";
export { SIMULATED_UPDATES } from "./shipments";

/** Raw operator events validated and normalized once, at load. */
export const SHIPMENTS: TrackedShipment[] = RAW_SHIPMENTS.map(track);

export const getShipment = (id: string): TrackedShipment | undefined => SHIPMENTS.find((s) => s.id === id);
export const siteOf = (s: { originSiteId: string }): Site => SITES.find((x) => x.id === s.originSiteId)!;
export const customerOf = (s: { customerId: string }): Customer => CUSTOMERS.find((x) => x.id === s.customerId)!;
