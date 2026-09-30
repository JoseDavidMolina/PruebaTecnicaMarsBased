import { notFound } from "next/navigation";
import { CustomerShipmentDetail, OpsShipmentDetail } from "@/components/shipment-detail";
import { getDemo, loadFacts, receivedBy } from "../../demo";

export default async function ShipmentPage(props: PageProps<"/shipments/[id]">) {
  const { id } = await props.params;
  const { user, shipments, simulated, done } = await getDemo();
  // Outside the user's perimeter looks exactly like not existing.
  const shipment = shipments.find((s) => s.id === id);
  if (!shipment) notFound();

  const facts = await loadFacts(shipment);
  const received = receivedBy(simulated, id);
  return user.role === "ops" ? (
    <OpsShipmentDetail facts={facts} received={received} done={done} />
  ) : (
    <CustomerShipmentDetail facts={facts} received={received} done={done} />
  );
}
