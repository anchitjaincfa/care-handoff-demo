import { expect, test } from "@playwright/test";

test("manifest is installable and all icons are local", async ({ page }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/manifest.webmanifest");
  const manifest = await page.evaluate(async (href) => {
    const response = await fetch(href ?? "/manifest.webmanifest");
    return response.json();
  }, manifestHref);
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/icon.svg", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-maskable.svg", purpose: "maskable" }),
  ]));
  expect(manifest.icons.every((icon: { src: string }) => icon.src.startsWith("/"))).toBe(true);
});

test("static delivery applies the production privacy and cache headers", async ({ request }) => {
  const shell = await request.get("/");
  expect(shell.headers()["content-security-policy"]).toContain("connect-src 'self'");
  expect(shell.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(shell.headers()["permissions-policy"]).toContain("geolocation=()");
  expect(shell.headers()["referrer-policy"]).toBe("no-referrer");

  const worker = await request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("max-age=0");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");

  const icon = await request.get("/icons/icon.svg");
  expect(icon.headers()["cache-control"]).toContain("immutable");
});

test("service worker owns the page and serves the shell offline", async ({ context, page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("main h1")).toBeVisible();
  await context.setOffline(false);
});
