import { cookies } from "next/headers";
import { ai } from "@/ai";
import type { ShipmentFacts } from "@/ai/query";
import type { NextAction } from "@/ai/types";
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

export async function getDemo() {
  const jar = await cookies();
  const user = USERS.find((u) => u.id === jar.get(USER_COOKIE)?.value) ?? USERS[0];
  const simulated = (jar.get(SIM_COOKIE)?.value ?? "").split(",").filter((id) => id in SIMULATED_UPDATES);
  const done = (jar.get(DONE_COOKIE)?.value ?? "").split(",").filter(Boolean);
  const all = SHIPMENTS.map((s) => (simulated.includes(s.id) ? withSimulatedUpdate(s) : s)).map((s) =>
    done.includes(doneKey(s.id, "upload_document")) ? withUploadedDocuments(s) : s,
  );
  return { user, simulated, done, shipments: visibleShipments(user, all) };
}

/** Everything the UI shows about a shipment, with the AI parts coming through the AiService. */
export async function loadFacts(s: TrackedShipment): Promise<ShipmentFacts> {
  const [eta, risk] = await Promise.all([ai.predictEta(s), ai.assessRisk(s)]);
  return { shipment: s, status: currentStatus(s), stale: isStale(s), eta, risk, destinationCountry: customerOf(s).place.country };
}
