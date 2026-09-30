import { cookies } from "next/headers";
import { ai } from "@/ai";
import type { ShipmentFacts } from "@/ai/query";
import type { CustomerNotice, NextAction } from "@/ai/types";
import { customerOf, SHIPMENTS, SIMULATED_UPDATES, USERS, withSimulatedUpdate, withUploadedDocuments } from "@/data";
import { visibleShipments } from "@/domain/perimeter";
import { currentStatus, isStale } from "@/domain/timeline";
import type { TrackedShipment } from "@/domain/types";

// Demo state lives in three cookies (no real auth, no backend): who is looking, which shipments
// already received their simulated operator update, and which proposed actions ops has completed.
export const USER_COOKIE = "demo-user";
export const SIM_COOKIE = "demo-sim";
export const DONE_COOKIE = "demo-done";

export type ActionKind = Exclude<NextAction["kind"], "none">;
export const ACTION_KINDS: ActionKind[] = ["notify_customer", "contact_operator", "upload_document"];

/** A completed action is keyed by shipment and kind: "shp-1003:contact_operator". */
export const doneKey = (shipmentId: string, kind: NextAction["kind"]) => `${shipmentId}:${kind}`;

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
  const simulated = (jar.get(SIM_COOKIE)?.value ?? "").split(",").filter((id) => id in SIMULATED_UPDATES);
  const done = (jar.get(DONE_COOKIE)?.value ?? "").split(",").filter(Boolean);
  // Uploads first: the operator's next message can depend on whether the file is complete.
  const all = SHIPMENTS.map((s) => (done.includes(doneKey(s.id, "upload_document")) ? withUploadedDocuments(s) : s)).map((s) =>
    simulated.includes(s.id) ? withSimulatedUpdate(s) : s,
  );
  return { user, simulated, done, shipments: visibleShipments(user, all) };
}

/** Everything the UI shows about a shipment, with the AI parts coming through the AiService. */
export async function loadFacts(s: TrackedShipment): Promise<ShipmentFacts> {
  const [eta, risk] = await Promise.all([ai.predictEta(s), ai.assessRisk(s)]);
  return { shipment: s, status: currentStatus(s), stale: isStale(s), eta, risk, destinationCountry: customerOf(s).place.country };
}
