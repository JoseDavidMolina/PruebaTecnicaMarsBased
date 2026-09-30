import { expect, test } from "@playwright/test";

// The demo script, end to end. Each test gets a fresh browser context, so demo cookies start clean.

test("operations: briefing, search, and an operator update that recalculates the ETA", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("daily-summary")).toContainText("5 at risk (1 held at customs, 1 delayed at port, 1 with no recent update");

  // Exception queue: worst first, with the proposed action.
  const firstRow = page.locator("tbody tr").first();
  await expect(firstRow).toContainText("SHP-1001");
  await expect(firstRow).toContainText("Upload commercial invoice");

  // Natural-language search shows what it understood.
  await page.getByLabel("Ask about your shipments").fill("what's going on with order 12345?");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByTestId("query-interpretation")).toContainText("Reference 12345");
  await expect(page.locator("tbody tr")).toHaveCount(1);

  // Multimodal shipment delayed at port.
  await page.goto("/shipments/shp-1002");
  await expect(page.getByTestId("next-action")).toContainText("Notify Arvenza México of the new ETA");
  await expect(page.getByText("Your shipment will arrive 2 days later than planned")).toBeVisible();

  await page.getByRole("button", { name: "Simulate operator update" }).click();
  await expect(page.getByText("Your shipment will arrive 12 hours later than planned")).toBeVisible();
  await expect(page.getByText("VAR · MXVER · MV Aurora Tide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
});

test("customer: own perimeter, proactive notices and the live delivery map", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Viewing as").selectOption("u-cust-solenne");
  await expect(page.getByRole("heading", { name: "Hello, Claire" })).toBeVisible();
  await expect(page.getByTestId("customer-notice").first()).toContainText("Arriving today, 11:00–13:00");

  await page.getByTestId("card-shp-1004").click();
  await expect(page.getByTestId("eta-main")).toHaveText("Today, 11:00–13:00");
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  // Another customer's shipment does not exist for Claire.
  const response = await page.goto("/shipments/shp-1001");
  expect(response?.status()).toBe(404);
});
