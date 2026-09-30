import { cookies } from "next/headers";
import { ai } from "@/ai";
import type { ShipmentFacts } from "@/ai/query";
import type { CustomerNotice, NextAction } from "@/ai/types";
import { customerOf, operatorMessage, SHIPMENTS, USERS, withMessages, withUploadedDocuments } from "@/data";
import { visibleShipments } from "@/domain/perimeter";
import { currentStatus, isStale } from "@/domain/timeline";
import type { TrackedShipment } from "@/domain/types";

// Demo state lives in three cookies (no real auth, no backend): who is looking, which operator messages
// each shipment received (in arrival order), and which proposed actions ops has completed.
export const USER_COOKIE = "demo-user";
export const SIM_COOKIE = "demo-sim";
export const DONE_COOKIE = "demo-done";

export type ActionKind = Exclude<NextAction["kind"], "none">;
export const ACTION_KINDS: ActionKind[] = ["notify_customer", "contact_operator", "upload_document"];

/** A completed action is keyed by shipment and kind: "shp-1003:contact_operator". */
export const doneKey = (shipmentId: string, kind: NextAction["kind"]) => `${shipmentId}:${kind}`;

/** A received operator message is keyed by shipment and variant: "shp-1001:hold". */
export const simKey = (shipmentId: string, message: string) => `${shipmentId}:${message}`;

/** The messages a shipment received, in arrival order. */
export const receivedBy = (simulated: readonly string[], shipmentId: string): string[] =>
  simulated.filter((k) => k.startsWith(`${shipmentId}:`)).map((k) => k.slice(shipmentId.length + 1));

/** Keeps the known messages of a (possibly tampered) cookie, once each, in the order they arrived. */
export const parseSimulated = (cookie: string | undefined): string[] =>
  [...new Set((cookie ?? "").split(","))].filter((k) => {
    const i = k.indexOf(":");
    return i > 0 && operatorMessage(k.slice(0, i), k.slice(i + 1)) !== undefined;
  });

/**
 * The notice the customer actually sees. A warning is only a draft until ops sends it (notify_customer);
 * informational notices, such as a confirmed delivery window, are shown automatically.
 * A new operator update reopens the case and clears its completed actions, so a warning already sent goes
 * back to draft on purpose: its figures were recomputed, and ops reviews them before the customer sees them.
 */
export const noticeForCustomer = (notice: CustomerNotice | null, shipmentId: string, done: string[]): CustomerNotice | null =>
  notice?.severity === "warning" && !done.includes(doneKey(shipmentId, "notify_customer")) ? null : notice;

export async function getDemo() {
  const jar = await cookies();
  const user = USERS.find((u) => u.id === jar.get(USER_COOKIE)?.value) ?? USERS[0];
  const simulated = parseSimulated(jar.get(SIM_COOKIE)?.value);
  const done = (jar.get(DONE_COOKIE)?.value ?? "").split(",").filter(Boolean);
  // Received messages are replayed as stored: what ops did afterwards (an upload) never rewrites them.
  const all = SHIPMENTS.map((s) =>
    withMessages(done.includes(doneKey(s.id, "upload_document")) ? withUploadedDocuments(s) : s, receivedBy(simulated, s.id)),
  );
  return { user, simulated, done, shipments: visibleShipments(user, all) };
}

/** Everything the UI shows about a shipment, with the AI parts coming through the AiService. */
export async function loadFacts(s: TrackedShipment): Promise<ShipmentFacts> {
  const [eta, risk] = await Promise.all([ai.predictEta(s), ai.assessRisk(s)]);
  return { shipment: s, status: currentStatus(s), stale: isStale(s), eta, risk, destinationCountry: customerOf(s).place.country };
}
