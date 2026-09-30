import type { Shipment, User } from "./types";

/** Customers see only their own shipments; ops users see the shipments leaving their sites. */
export const visibleShipments = <T extends Shipment>(user: User, shipments: T[]): T[] =>
  shipments.filter((s) => (user.role === "customer" ? s.customerId === user.customerId : user.siteIds.includes(s.originSiteId)));
