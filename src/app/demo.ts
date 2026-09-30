import { cookies } from "next/headers";
import { ai } from "@/ai";
import type { ShipmentFacts } from "@/ai/query";
import { customerOf, SHIPMENTS, SIMULATED_UPDATES, USERS, withSimulatedUpdate } from "@/data";
import { visibleShipments } from "@/domain/perimeter";
import { currentStatus, isStale } from "@/domain/timeline";
import type { TrackedShipment } from "@/domain/types";

// Demo state lives in two cookies (no real auth, no backend): who is looking, and which
// shipments already received their simulated operator update.
export const USER_COOKIE = "demo-user";
export const SIM_COOKIE = "demo-sim";

export async function getDemo() {
  const jar = await cookies();
  const user = USERS.find((u) => u.id === jar.get(USER_COOKIE)?.value) ?? USERS[0];
  const simulated = (jar.get(SIM_COOKIE)?.value ?? "").split(",").filter((id) => id in SIMULATED_UPDATES);
  const all = SHIPMENTS.map((s) => (simulated.includes(s.id) ? withSimulatedUpdate(s) : s));
  return { user, simulated, shipments: visibleShipments(user, all) };
}

/** Everything the UI shows about a shipment, with the AI parts coming through the AiService. */
export async function loadFacts(s: TrackedShipment): Promise<ShipmentFacts> {
  const [eta, risk] = await Promise.all([ai.predictEta(s), ai.assessRisk(s)]);
  return { shipment: s, status: currentStatus(s), stale: isStale(s), eta, risk, destinationCountry: customerOf(s).place.country };
}
