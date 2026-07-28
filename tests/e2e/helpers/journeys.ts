import { expect, type BrowserContext, type Page } from "@playwright/test";

export const JOURNEY_VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
} as const;

export const OFFLINE_CARE_ROUTES = [
  { path: "/today/", heading: /baby|today|care day|good (?:morning|afternoon|evening)/i },
  { path: "/timeline/", heading: /timeline|care record/i },
  { path: "/capture/", heading: /what happened|check every detail|entry saved/i },
  { path: "/pass/#demo", heading: /handoff pass|shift briefing|no handoff pass|cannot be opened|past.*expiry/i },
] as const;

export async function completeCaptureJourney(page: Page, note: string): Promise<void> {
  await page.goto("/capture/");
  await page.getByRole("textbox", { name: /care note/i }).fill(note);
  await page.getByRole("button", { name: /review this entr(?:y|ies)/i }).click();
  const originalNote = page.getByRole("complementary").filter({ hasText: /source note/i });
  await expect(originalNote.getByText(note, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^feed$/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^diaper$/i })).toBeVisible();
  const confirm = page.getByRole("button", { name: /confirm reviewed entr(?:y|ies)/i });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByRole("heading", { name: /entry saved/i })).toBeVisible();
}

export async function stopActiveTimerJourney(page: Page): Promise<void> {
  await page.goto("/today/");
  const stop = page.getByRole("button", { name: /stop timer/i });
  for (let pass = 0; pass < 5 && await stop.count() > 0; pass += 1) {
    const before = await stop.count();
    await stop.first().click();
    await expect(stop).toHaveCount(before - 1);
  }
  await expect(stop).toHaveCount(0);

  const feedStart = page.getByRole("button", { name: /start feed timer/i });
  await feedStart.click();
  const cancelledReview = page.getByRole("dialog", { name: /review timer start/i });
  await expect(cancelledReview).toBeVisible();
  await expect(stop).toHaveCount(0);
  await cancelledReview.getByRole("button", { name: /^cancel$/i }).click();
  await expect(cancelledReview).toBeHidden();
  await expect(feedStart).toBeFocused();
  await expect(stop).toHaveCount(0);

  await page.getByRole("button", { name: /start sleep timer/i }).click();
  const confirmedReview = page.getByRole("dialog", { name: /review timer start/i });
  await expect(confirmedReview).toBeVisible();
  await expect(stop).toHaveCount(0);
  await confirmedReview.getByRole("button", { name: /confirm and start timer/i }).click();
  await expect(stop.first()).toBeEnabled();
  await stop.first().click();
  await expect(stop).toHaveCount(0);
  await expect(page.getByText(/no timers are active/i)).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

export async function createHandoffJourney(page: Page): Promise<void> {
  const exactFood = "A".repeat(120);
  await page.goto("/today/");
  await page.getByRole("button", { name: /^Solids/i }).click();
  const quickLog = page.getByRole("dialog", { name: /review quick log/i });
  await quickLog.getByRole("textbox", { name: /food offered/i }).fill(exactFood);
  await quickLog.getByRole("button", { name: /confirm quick log/i }).click();

  await page.goto("/handoff/");
  await expect(page.getByText(exactFood, { exact: true })).toBeVisible();
  const disclosure = page.getByText(/food labels shown above are included in the qr code or link and may remain in recipient apps after sharing/i);
  await expect(disclosure).toBeVisible();
  const disclosureId = await disclosure.getAttribute("id");
  expect(disclosureId).toBeTruthy();
  await expect(page.getByRole("button", { name: /create qr pass/i })).toHaveAttribute("aria-describedby", disclosureId!);
  await expect(page.getByRole("button", { name: /create link pass/i })).toHaveAttribute("aria-describedby", disclosureId!);
  await expect(page.getByRole("heading", { name: /full-shift totals/i })).toBeVisible();
  await expect(page.getByText(/totals cover the full shift.*30 most recent included events/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: /create qr pass/i }).click();
  const consent = page.getByRole("dialog", { name: /create a shareable copy/i });
  await expect(consent).toContainText(/food labels shown above are included in the qr code or link and may remain in recipient apps after sharing/i);
  await consent.getByRole("button", { name: /create qr pass/i }).click();
  const qr = page.getByRole("img", { name: /scannable handoff qr code/i });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image/png;base64,/i);
  await page.getByRole("link", { name: /read-only handoff pass/i }).click();
  await expect(page.getByRole("heading", { name: /full-shift totals/i })).toBeVisible();
  await expect(page.getByText(exactFood, { exact: true })).toBeVisible();
  await expect(page.getByText(/totals cover the full shift.*30 most recent included events/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

export async function deleteEverythingJourney(page: Page): Promise<void> {
  await page.goto("/privacy/");
  await page.getByRole("button", { name: /^delete everything$/i }).click();
  const confirmation = page.getByRole("dialog", { name: /permanently delete this device.*family data/i });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("textbox", { name: /type delete to confirm/i }).fill("DELETE");
  await confirmation.getByRole("button", { name: /^delete everything$/i }).click();
  await expect(page.getByText(/saved on this device|deleted|removed/i).first()).toBeVisible();
}

export async function verifyOfflineCareRoutes(context: BrowserContext, page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  try {
    for (const route of OFFLINE_CARE_ROUTES) {
      const response = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(response, `service worker returned no response for ${route.path}`).not.toBeNull();
      expect(response?.status(), `${route.path} must not use the worker's 503 fallback`).not.toBe(503);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText(/^Offline$/);
    }
  } finally {
    await context.setOffline(false);
  }
}
