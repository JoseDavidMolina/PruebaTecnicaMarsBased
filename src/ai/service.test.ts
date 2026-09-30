import { describe, expect, it } from "vitest";
import { getShipment, SHIPMENTS, withUploadedDocuments } from "@/data";
import { predictEta } from "./eta";
import { parseQuery } from "./query";
import { assessRisk } from "./risk";
import { answerQuery, customerNotice, factsFor, mockAiService, suggestMapping, suggestNextAction, summarizeDay } from "./service";

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
      "Today: 5 at risk (1 held at customs, 1 delayed at port, 1 with no recent update, 1 with a delivery incident, 1 running late), 1 out for delivery, 1 delivered.",
    );
    expect(summary.items.map((i) => i.shipmentId)).toEqual(["shp-1001", "shp-1010", "shp-1002", "shp-1003", "shp-1016"]);
  });

  it("counts deliveries of today's Madrid calendar day, not the last 24 hours", () => {
    // SHP-1005 was delivered at 13:00 yesterday (within 24 h); SHP-1015 at 07:00 today.
    expect(summarizeDay(SHIPMENTS).counts.deliveredToday).toBe(1);
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

  it("asks the operator about an update it could not read", () => {
    expect(action("shp-1014")).toMatchObject({ kind: "contact_operator", label: "Ask Alpenweg Logistik what their latest update means" });
  });
});

describe("customerNotice", () => {
  it("explains a port delay the way the brief describes it", () => {
    expect(notice("shp-1002")).toMatchObject({
      severity: "warning",
      title: "Your shipment will arrive 2 days later than planned",
    });
    // The cause comes from the operator's data (vessel behind plan), never from an invented reason.
    expect(notice("shp-1002")?.body).toMatch(/^The vessel is running 4 days behind schedule at the Port of Veracruz\. New estimated delivery: /);
  });

  it("does not claim actions nobody has taken", () => {
    for (const id of ["shp-1001", "shp-1003"]) {
      expect(notice(id)?.body).not.toMatch(/we (are|have)/i);
    }
  });

  it("confirms the delivery window, and stays quiet when there is nothing to say", () => {
    expect(notice("shp-1004")?.title).toBe("Arriving today, 09:00–11:00"); // exactly the window Kestrel sent
    expect(notice("shp-1006")).toBeNull();
    expect(notice("shp-1005")).toBeNull();
  });
});

describe("answerQuery", () => {
  const facts = (ids: string[]) => ids.map((id) => factsFor(getShipment(id)!));

  it("answers a question about one order from its facts, with the next step", () => {
    const a = answerQuery(parseQuery("order 12345"), facts(["shp-1001"]));
    expect(a.shipmentId).toBe("shp-1001");
    expect(a.text).toMatch(/^SHP-1001 \(order PO-12345, Arvenza UK Ltd\) is held at customs\./);
    expect(a.text).toContain("Missing: Commercial invoice.");
    expect(a.text).toContain("Suggested next step: Upload commercial invoice.");
  });

  it("summarizes several matches and points at the most urgent", () => {
    expect(answerQuery(parseQuery("from Zaragoza"), facts(["shp-1006", "shp-1002", "shp-1003"])).text).toMatch(
      /^3 shipments match\. 2 need attention.*Most urgent: SHP-1002/,
    );
    expect(answerQuery(parseQuery("to Italy"), []).text).toMatch(/^No shipments match/);
  });

  it("says what it could not understand instead of answering anyway", () => {
    expect(answerQuery(parseQuery("shipments to Narnia by dragon"), []).text).toBe(
      "I couldn't understand 'narnia, dragon'. Try a country, status, operator, site or order number.",
    );
  });
});

describe("suggestMapping", () => {
  it("proposes a reading for an unmapped code, and nothing for mapped ones", () => {
    const s = getShipment("shp-1014")!;
    expect(suggestMapping(s.milestones.at(-1)!)).toMatchObject({ status: "in_transit" });
    expect(suggestMapping(s.milestones[0])).toBeNull();
  });
});

describe("after ops uploads the missing invoice", () => {
  it("moves on to the next blocker instead of asking again", () => {
    const s = withUploadedDocuments(getShipment("shp-1001")!);
    expect(suggestNextAction(s, assessRisk(s))).toMatchObject({ kind: "contact_operator", label: "Ask Transvolta Road Freight why customs is holding it" });
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
