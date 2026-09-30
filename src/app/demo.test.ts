import { describe, expect, it } from "vitest";
import type { CustomerNotice } from "@/ai/types";
import { doneKey, noticeForCustomer } from "./demo";

const warning: CustomerNotice = { severity: "warning", title: "Your shipment will arrive 2 days later than planned", body: "" };
const info: CustomerNotice = { severity: "info", title: "Arriving today, 09:00–11:00", body: "" };

describe("noticeForCustomer", () => {
  it("keeps a warning from the customer until ops sends it", () => {
    expect(noticeForCustomer(warning, "shp-1002", [])).toBeNull();
    expect(noticeForCustomer(warning, "shp-1002", [doneKey("shp-1002", "contact_operator")])).toBeNull();
    expect(noticeForCustomer(warning, "shp-1002", [doneKey("shp-1001", "notify_customer")])).toBeNull();
    expect(noticeForCustomer(warning, "shp-1002", [doneKey("shp-1002", "notify_customer")])).toBe(warning);
  });

  it("shows informational notices automatically", () => {
    expect(noticeForCustomer(info, "shp-1004", [])).toBe(info);
    expect(noticeForCustomer(null, "shp-1006", [])).toBeNull();
  });
});
