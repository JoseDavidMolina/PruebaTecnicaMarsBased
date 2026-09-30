import { describe, expect, it } from "vitest";
import { getShipment, SHIPMENTS } from "@/data";
import { predictEta } from "./eta";
import { assessRisk } from "./risk";
import { customerNotice, mockAiService, suggestNextAction, summarizeDay } from "./service";

const action = (id: string) => {
  const s = getShipment(id)!;
  return suggestNextAction(s, assessRisk(s));
};
const notice = (id: string) => {
  const s = getShipment(id)!;
  return customerNotice(s, predictEta(s));
};

describe("summarizeDay", () => {
  it("writes the ops headline and ranks the exception queue", () => {
    const summary = summarizeDay(SHIPMENTS);
    expect(summary.headline).toBe(
      "Today: 5 at risk (1 held at customs, 1 delayed at port, 1 with no recent update, 1 with a delivery incident), 1 out for delivery, 2 delivered.",
    );
    expect(summary.items.map((i) => i.shipmentId)).toEqual(["shp-1001", "shp-1010", "shp-1002", "shp-1003", "shp-1016"]);
  });
});

describe("suggestNextAction", () => {
  it("proposes the action that unblocks each case", () => {
    expect(action("shp-1001")).toMatchObject({ kind: "upload_document", label: "Upload commercial invoice" });
    expect(action("shp-1002")).toMatchObject({ kind: "notify_customer", label: "Notify Arvenza México of the new ETA" });
    expect(action("shp-1003").kind).toBe("contact_operator");
    expect(action("shp-1010").kind).toBe("contact_operator");
    expect(action("shp-1006").kind).toBe("none");
  });
});

describe("customerNotice", () => {
  it("explains a port delay the way the brief describes it", () => {
    expect(notice("shp-1002")).toMatchObject({
      severity: "warning",
      title: "Your shipment will arrive 2 days later than planned",
    });
    expect(notice("shp-1002")?.body).toMatch(/^This is due to congestion at the Port of Veracruz\. New estimated delivery: /);
  });

  it("confirms the delivery window, and stays quiet when there is nothing to say", () => {
    expect(notice("shp-1004")?.title).toBe("Arriving today, 11:00–13:00"); // Europe/Madrid
    expect(notice("shp-1006")).toBeNull();
    expect(notice("shp-1005")).toBeNull();
  });
});

describe("mockAiService", () => {
  it("returns outputs that pass the AI output schemas", async () => {
    await expect(mockAiService.summarizeDay(SHIPMENTS)).resolves.toBeDefined();
    for (const s of SHIPMENTS) {
      const eta = await mockAiService.predictEta(s);
      await mockAiService.suggestNextAction(s, await mockAiService.assessRisk(s));
      await mockAiService.customerNotice(s, eta);
    }
  });
});
