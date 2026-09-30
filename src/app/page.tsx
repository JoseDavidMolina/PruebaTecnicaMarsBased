import { CustomerHome } from "@/components/customer-home";
import { OpsDashboard, type DashboardParams } from "@/components/ops-dashboard";
import { getDemo } from "./demo";

export default async function Home(props: PageProps<"/">) {
  const { user, shipments, done } = await getDemo();
  const sp = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const params: DashboardParams = { q: one(sp.q), site: one(sp.site), op: one(sp.op), view: one(sp.view) };

  return user.role === "ops" ? (
    <OpsDashboard user={user} shipments={shipments} params={params} done={done} />
  ) : (
    <CustomerHome user={user} shipments={shipments} done={done} />
  );
}
