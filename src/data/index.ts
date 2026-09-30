import { track } from "@/domain/timeline";
import type { Customer, RawEvent, Site, TrackedShipment } from "@/domain/types";
import { CUSTOMERS, SITES } from "./reference";
import { RAW_SHIPMENTS, SIMULATED_UPDATES, SIMULATED_WHILE_FILE_INCOMPLETE } from "./shipments";

export { CUSTOMERS, SITES, USERS } from "./reference";
export { SIMULATED_UPDATES };

export const SHIPMENTS: TrackedShipment[] = RAW_SHIPMENTS.map(track);

/** A demo message from the operator: its regular update, or the hold it repeats while the file is incomplete (SHP-1001). */
export type OperatorMessage = "update" | "hold";

/** The raw event behind a message, or undefined for an unknown shipment or variant (both can come from a tampered cookie). */
export const operatorMessage = (shipmentId: string, message: string): RawEvent | undefined => {
  const events = message === "update" ? SIMULATED_UPDATES : message === "hold" ? SIMULATED_WHILE_FILE_INCOMPLETE : undefined;
  return events && Object.hasOwn(events, shipmentId) ? events[shipmentId] : undefined;
};

/**
 * What the operator sends next, decided from the shipment as it is when the message arrives, never afterwards.
 * Customs does not release a shipment whose file is incomplete, so until ops uploads it the operator repeats the hold (once).
 * undefined: nothing left to send, or nothing until the file is complete.
 */
export function nextOperatorMessage(s: TrackedShipment, received: readonly string[]): OperatorMessage | undefined {
  if (!operatorMessage(s.id, "update") || received.includes("update")) return undefined;
  if (operatorMessage(s.id, "hold") && s.documents.some((d) => d.status === "missing"))
    return received.includes("hold") ? undefined : "hold";
  return "update";
}

/** Replays the messages a shipment received, exactly as they arrived and in that order. */
export const withMessages = (s: TrackedShipment, received: readonly string[]): TrackedShipment => {
  const events = received.flatMap((m) => operatorMessage(s.id, m) ?? []);
  return events.length ? track({ ...s, events: [...s.events, ...events] }) : s;
};

export const withUploadedDocuments = (s: TrackedShipment): TrackedShipment => ({
  ...s,
  documents: s.documents.map((d) => ({ ...d, status: "available" })),
});

export const getShipment = (id: string): TrackedShipment | undefined => SHIPMENTS.find((s) => s.id === id);
export const siteOf = (s: { originSiteId: string }): Site => SITES.find((x) => x.id === s.originSiteId)!;
export const customerOf = (s: { customerId: string }): Customer => CUSTOMERS.find((x) => x.id === s.customerId)!;
