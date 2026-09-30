"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SIMULATED_UPDATES, USERS } from "@/data";
import { SIM_COOKIE, USER_COOKIE } from "./demo";

// Inputs are checked against the known ids: Server Actions are reachable by direct POST.

export async function switchUser(formData: FormData) {
  const id = String(formData.get("userId"));
  if (USERS.some((u) => u.id === id)) (await cookies()).set(USER_COOKIE, id);
  redirect("/");
}

export async function simulateUpdate(formData: FormData) {
  const id = String(formData.get("shipmentId"));
  if (!(id in SIMULATED_UPDATES)) return;
  const jar = await cookies();
  const current = (jar.get(SIM_COOKIE)?.value ?? "").split(",").filter(Boolean);
  if (!current.includes(id)) jar.set(SIM_COOKIE, [...current, id].join(","));
}

export async function resetDemo() {
  (await cookies()).delete(SIM_COOKIE);
}
