import Link from "next/link";
import { ai } from "@/ai";
import { loadFacts, noticeForCustomer } from "@/app/demo";
import { CUSTOMERS, customerOf, siteOf } from "@/data";
import type { TrackedShipment, User } from "@/domain/types";
import { etaText } from "@/lib/eta-display";
import { Card, CardContent } from "@/components/ui/card";
import { NoticeBanner } from "./shipment-detail";
import { AiTag, ConfidenceMeter, DelayNote, ModeTrail, ReliabilityBadge, StatusBadge } from "./shipment-bits";

export async function CustomerHome({
  user,
  shipments,
  done,
}: {
  user: Extract<User, { role: "customer" }>;
  shipments: TrackedShipment[];
  done: string[];
}) {
  const facts = await Promise.all(shipments.map(loadFacts));
  const notices = await Promise.all(
    facts.map(async (f) => noticeForCustomer(await ai.customerNotice(f.shipment, f.eta), f.shipment.id, done)),
  );
  // Open shipments first, soonest arrival first; delivered ones last, most recent first.
  const order = facts
    .map((f, i) => ({ f, notice: notices[i] }))
    .sort((a, b) => {
      const da = a.f.status === "delivered";
      const db = b.f.status === "delivered";
      return da !== db
        ? Number(da) - Number(db)
        : da
          ? b.f.eta.expected.localeCompare(a.f.eta.expected)
          : a.f.eta.expected.localeCompare(b.f.eta.expected);
    });
  const withNotice = order.filter((o) => o.notice);
  const company = CUSTOMERS.find((c) => c.id === user.customerId)!;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hello, {user.name.split(" ")[0]}</h1>
        <p className="text-sm text-muted-foreground">
          {company.name} · {shipments.length} shipment{shipments.length === 1 ? "" : "s"} on their way to you or recently delivered
        </p>
      </div>

      {withNotice.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            Updates for you <AiTag label="Proactive" />
          </div>
          {withNotice.map(({ f, notice }) => (
            <NoticeBanner
              key={f.shipment.id}
              notice={{ ...notice!, title: `${f.shipment.orderRef}: ${notice!.title}` }}
              href={`/shipments/${f.shipment.id}`}
            />
          ))}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {order.map(({ f }) => {
          const s = f.shipment;
          const delivered = f.status === "delivered";
          const t = etaText(f.eta, delivered);
          return (
            <Link key={s.id} href={`/shipments/${s.id}`} className="block" data-testid={`card-${s.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">Order {s.orderRef}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {siteOf(s).place.name} → {customerOf(s).place.name} <ModeTrail legs={s.legs} />
                      </div>
                    </div>
                    <StatusBadge status={f.status} />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{delivered ? "Delivered" : "Arriving"}</div>
                    <div className="text-2xl font-semibold tracking-tight tabular-nums">
                      {delivered ? t.main.replace("Delivered ", "") : t.main}
                    </div>
                    {t.sub && <div className="text-xs text-muted-foreground">{t.sub}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <ReliabilityBadge reliability={f.eta.reliability} />
                    {f.eta.reliability === "estimated" && <ConfidenceMeter confidence={f.eta.confidence} />}
                    {!delivered && <DelayNote eta={f.eta} stale={f.stale} />}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
