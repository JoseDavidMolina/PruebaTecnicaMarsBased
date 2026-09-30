import { expect, test } from "@playwright/test";

// The demo script, end to end. Each test gets a fresh browser context, so demo cookies start clean.

// Every page must hydrate cleanly. (A screenshot taken before hydration hides the caret with an inline style,
// which React reports as a mismatch: that is the harness, not the app, so none is taken here.)
let hydrationErrors: string[] = [];
test.beforeEach(({ page }) => {
  hydrationErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /hydrat/i.test(m.text())) hydrationErrors.push(`${page.url()}: ${m.text().slice(0, 200)}`);
  });
});
test.afterEach(() => expect(hydrationErrors).toEqual([]));

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
  await expect(page.getByTestId("daily-summary")).toContainText("5 at risk (1 held at customs");
  await expect(page.getByTestId("daily-summary")).toContainText("· 1 handled today.");
  await expect(page.getByTestId("row-shp-1002")).toHaveCount(0);
});

test("an operator message already received never changes: uploading only affects the next one", async ({ page }) => {
  await page.goto("/shipments/shp-1001");
  const at0900 = page.locator("li").filter({ hasText: "7 Oct, 09:00 · Dover" });
  const simulate = page.getByRole("button", { name: "Simulate operator update" });

  // The invoice is still missing, so Transvolta reports the hold again.
  await simulate.click();
  await expect(at0900).toHaveCount(1);
  await expect(at0900).toContainText("Code 40");
  await expect(page.getByText("reported the hold again")).toBeVisible();

  await page.getByTestId("next-action").getByRole("button", { name: "Upload" }).click();
  await expect(page.getByTestId("next-action")).not.toContainText("Upload commercial invoice");
  await expect(at0900).toHaveCount(1);
  await expect(at0900).toContainText("Code 40");

  // With the file complete, the release arrives as a new event after the hold.
  await simulate.click();
  await expect(at0900).toHaveCount(2);
  await expect(at0900.first()).toContainText("Code 40");
  await expect(at0900.last()).toContainText("Code 45");
  await expect(page.getByText("sent its update")).toBeVisible();
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

test("customer: own perimeter, proactive notices and the reported delivery route", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Viewing as").selectOption("u-cust-solenne");
  await expect(page.getByRole("heading", { name: "Hello, Claire" })).toBeVisible();
  await expect(page.getByTestId("customer-notice").first()).toContainText("Arriving today, 09:00–11:00 CEST");

  await page.getByTestId("card-shp-1004").click();
  await expect(page.getByTestId("eta-main")).toHaveText("Today, 09:00–11:00 CEST");
  await expect(page.getByText("Confirmed").first()).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Packing list (demo)" })).toHaveAttribute("href", "/demo-document.pdf");
  await expect(page.getByTestId("map-source")).toHaveText("Reported by Tarnwick Parcel at 7 Oct, 08:50 CEST. Shown only while out for delivery.");

  // Another customer's shipment does not exist for Claire.
  const response = await page.goto("/shipments/shp-1001");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Not found" })).toBeVisible();
});

test("nothing scrolls sideways at 390 px, with the full header showing", async ({ page, context, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // An applied update brings the Reset button into the header, its widest state.
  await context.addCookies([{ name: "demo-sim", value: "shp-1002:update", url: baseURL! }]);
  const pages: [string, string][] = [
    ["u-ops-all", "/"],
    ["u-ops-all", "/shipments/shp-1002"],
    ["u-cust-oskendra-mx", "/"],
    ["u-cust-solenne", "/shipments/shp-1004"],
  ];
  for (const [user, path] of pages) {
    await context.addCookies([{ name: "demo-user", value: user, url: baseURL! }]);
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Reset demo" })).toBeVisible();
    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(scroll, `${user} ${path}`).toBe(client);
  }
});

test("keyboard users browse a filter with the arrow keys and apply it with Enter", async ({ page }) => {
  await page.goto("/");
  const site = page.getByLabel("Origin site");
  await site.focus();
  await page.keyboard.press("ArrowDown");
  await expect(site).toHaveValue("site-zgz");
  await page.waitForTimeout(500); // an auto-submit would have navigated by now
  expect(new URL(page.url()).search).toBe("");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/site=site-zgz/);
  await expect(page.getByText("· Zaragoza Plant only")).toBeVisible();
});
