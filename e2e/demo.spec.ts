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
  await expect(page.getByTestId("query-answer")).toContainText("SHP-1001 (order PO-12345, Oskendra UK Ltd) is held at customs");

  // Acting on the proposal: uploading the invoice moves the case on to its next blocker.
  await page.goto("/shipments/shp-1001");
  await page.getByTestId("next-action").getByRole("button", { name: "Upload" }).click();
  await expect(page.getByTestId("next-action")).toContainText("Ask Transvolta Road Freight why customs is holding it");

  // Multimodal shipment delayed at port.
  await page.goto("/shipments/shp-1002");
  await expect(page.getByTestId("next-action")).toContainText("Notify Oskendra México of the new ETA");
  await expect(page.getByText("Your shipment will arrive 2 days later than planned")).toBeVisible();

  await page.getByRole("button", { name: "Simulate operator update" }).click();
  await expect(page.getByText("Your shipment will arrive 12 hours later than planned")).toBeVisible();
  await expect(page.getByText("VAR · MXVER · MV Aurora Tide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();

  // Sending the notice takes the shipment out of the queue.
  await page.getByTestId("next-action").getByRole("button", { name: "Send notice" }).click();
  await expect(page.getByTestId("next-action")).toContainText("Notice sent");
  await page.goto("/");
  await expect(page.getByTestId("handled-count")).toHaveText("1 handled today");
  await expect(page.getByTestId("row-shp-1002")).toHaveCount(0);
});

test("the briefing and its KPIs describe what the filters show", async ({ page }) => {
  await page.goto("/?site=site-brno");
  await expect(page.getByTestId("daily-summary")).toHaveText("Today: 1 at risk (1 with no recent update), 0 out for delivery, 0 delivered.");
  await expect(page.getByText("· Brno Plant only")).toBeVisible();
  // The KPI keeps the filter, so its drill-down shows the same count.
  await page.getByRole("link", { name: "1 No recent update" }).click();
  await expect(page).toHaveURL(/q=stale&site=site-brno/);
  await expect(page.locator("tbody tr")).toHaveCount(1);
});

test("a drafted warning reaches the customer only once ops sends it", async ({ page }) => {
  // Waits for the greeting, so the switch has landed before navigating on.
  const viewAs = async (userId: string, greeting: string) => {
    await page.goto("/");
    await page.getByLabel("Viewing as").selectOption(userId);
    await expect(page.getByRole("heading", { name: greeting })).toBeVisible();
  };

  await viewAs("u-cust-oskendra-mx", "Hello, Diego");
  await expect(page.getByText("later than planned")).toHaveCount(0);

  await viewAs("u-ops-all", "Good morning, Marta");
  await page.goto("/shipments/shp-1002");
  await expect(page.getByTestId("customer-view")).toContainText("Not visible to the customer yet");
  await page.getByTestId("next-action").getByRole("button", { name: "Send notice" }).click();
  await expect(page.getByTestId("customer-view")).toContainText("Sent · visible to the customer");

  await viewAs("u-cust-oskendra-mx", "Hello, Diego");
  await expect(page.getByTestId("customer-notice")).toContainText("PO-12402: Your shipment will arrive 2 days later than planned");
});

test("customer: own perimeter, proactive notices and the live delivery map", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Viewing as").selectOption("u-cust-solenne");
  await expect(page.getByRole("heading", { name: "Hello, Claire" })).toBeVisible();
  await expect(page.getByTestId("customer-notice").first()).toContainText("Arriving today, 09:00–11:00");

  await page.getByTestId("card-shp-1004").click();
  await expect(page.getByTestId("eta-main")).toHaveText("Today, 09:00–11:00");
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();

  // Another customer's shipment does not exist for Claire.
  const response = await page.goto("/shipments/shp-1001");
  expect(response?.status()).toBe(404);
});
