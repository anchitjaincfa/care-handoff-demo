import { expect, test } from "@playwright/test";
import {
  JOURNEY_VIEWPORTS,
  completeCaptureJourney,
  createHandoffJourney,
  deleteEverythingJourney,
  stopActiveTimerJourney,
  verifyOfflineCareRoutes,
} from "./helpers/journeys";


for (const [profile, viewport] of Object.entries(JOURNEY_VIEWPORTS)) {
  test.describe(`${profile} wired care journeys`, () => {
    test.use({ viewport });
    test("capture, timer, and handoff", async ({ page }) => {
      await completeCaptureJourney(page, "Fed 3 oz at 8 pm then changed a wet diaper 10 minutes ago");
      await stopActiveTimerJourney(page);
      await createHandoffJourney(page);
    });

    test("offline routes and deletion", async ({ context, page }) => {
      await verifyOfflineCareRoutes(context, page);
      await deleteEverythingJourney(page);
    });
  });
}


test.describe("mobile release controls", () => {
  test.use({ viewport: JOURNEY_VIEWPORTS.mobile });

  test("keeps timeline actions, privacy, settings, and demo exit visible", async ({ page }) => {
    await page.goto("/demo/?surface=timeline", { waitUntil: "networkidle" });
    const firstEvent = page.locator(".timeline-event").first();
    await expect(firstEvent.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(firstEvent.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(page.locator(".bottom-nav a[href=\"/demo/?surface=privacy\"]")).toBeVisible();
    await expect(page.locator(".bottom-nav a[href=\"/demo/?surface=settings\"]")).toBeVisible();
    await expect(page.locator(".bottom-nav a[href=\"/\"]")).toBeVisible();
  });
});


test.describe("demo capture realm boundary", () => {
  test.use({ viewport: JOURNEY_VIEWPORTS.mobile });

  test("returns a committed demo capture to demo Today without crossing into the real realm", async ({ page }) => {
    await page.goto("/demo/?surface=capture", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: /care note/i }).fill("wet diaper now");
    await page.getByRole("button", { name: /review this entr(?:y|ies)/i }).click();
    const confirm = page.getByRole("button", { name: /confirm reviewed entr(?:y|ies)/i });
    await expect(confirm).toBeEnabled();
    await confirm.click();
    const returnLink = page.getByRole("link", { name: /return to today/i });
    await expect(returnLink).toHaveAttribute("href", "/demo/?surface=today");
    await returnLink.click();
    await expect(page).toHaveURL(/\/demo\/\?surface=today$/);
    const destination = new URL(page.url());
    expect(destination.pathname).toBe("/demo/");
    expect(destination.pathname).not.toBe("/today/");
    expect(destination.searchParams.get("surface")).toBe("today");
    await expect(page.locator('.bottom-nav a[href="/demo/?surface=today"]')).toHaveAttribute("aria-current", "page");
  });
});
