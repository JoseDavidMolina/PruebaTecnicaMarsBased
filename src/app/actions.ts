"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { nextOperatorMessage, USERS } from "@/data";
import { ACTION_KINDS, type ActionKind, doneKey, DONE_COOKIE, getDemo, receivedBy, SIM_COOKIE, simKey, USER_COOKIE } from "./demo";

// Inputs are checked against the known ids and the current user's perimeter: Server Actions are reachable by direct POST.

const list = (value: string | undefined) => (value ?? "").split(",").filter(Boolean);

export async function switchUser(formData: FormData) {
  const id = String(formData.get("userId"));
  if (USERS.some((u) => u.id === id)) (await cookies()).set(USER_COOKIE, id);
  redirect("/");
}

/**
 * Injects the next operator message. Any role may press it, customers included: it is a demo control that
 * stands in for the operator's feed. It still only reaches shipments inside the current user's perimeter.
 */
export async function simulateUpdate(formData: FormData) {
  const id = String(formData.get("shipmentId"));
  const { shipments, simulated } = await getDemo();
  const shipment = shipments.find((s) => s.id === id);
  // Which message arrives is decided now, from the file as it is now, and stored as received.
  const message = shipment && nextOperatorMessage(shipment, receivedBy(simulated, id));
  if (!message) return;
  const jar = await cookies();
  jar.set(SIM_COOKIE, [...simulated, simKey(id, message)].join(","));
  // New operator information reopens the case: what ops decided before may no longer apply.
  // An uploaded document is a fact, not a decision, so it stays uploaded.
  const keep = (k: string) => !k.startsWith(`${id}:`) || k === doneKey(id, "upload_document");
  jar.set(DONE_COOKIE, list(jar.get(DONE_COOKIE)?.value).filter(keep).join(","));
}

/** Ops completes the proposed next action. Only for an ops user, on a shipment inside their perimeter. */
export async function completeAction(formData: FormData) {
  const id = String(formData.get("shipmentId"));
  const kind = String(formData.get("kind")) as ActionKind;
  const { user, shipments } = await getDemo();
  if (user.role !== "ops" || !ACTION_KINDS.includes(kind) || !shipments.some((s) => s.id === id)) return;
  const jar = await cookies();
  const current = list(jar.get(DONE_COOKIE)?.value);
  if (!current.includes(doneKey(id, kind))) jar.set(DONE_COOKIE, [...current, doneKey(id, kind)].join(","));
}

export async function resetDemo() {
  const jar = await cookies();
  jar.delete(SIM_COOKIE);
  jar.delete(DONE_COOKIE);
}
