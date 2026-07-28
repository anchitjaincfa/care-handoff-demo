import { expect, test } from "@playwright/test";
import { OFFLINE_CARE_ROUTES, verifyOfflineCareRoutes } from "./helpers/journeys";

const PRODUCTION_ROUTES = ["/", ...OFFLINE_CARE_ROUTES.map((route) => route.split("#")[0] ?? route)] as const;

test("manifest is installable while the UI states browser platform limits", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const manifest = await page.evaluate(async (value) => (await fetch(value ?? "/manifest.webmanifest")).json(), href);
  expect(manifest).toEqual(expect.objectContaining({ id: "/", start_url: "/", scope: "/", display: "standalone" }));
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }),
    expect.objectContaining({ src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }),
  ]));
  for (const icon of manifest.icons.filter((entry: { type: string }) => entry.type === "image/png")) {
    expect(icon.src.startsWith("/")).toBe(true);
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    expect((await response.body()).byteLength).toBeGreaterThan(100);
  }
  await page.goto("/settings/");
  await expect(page.getByText(/availability varies by browser/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /install walkthrough/i })).toBeDisabled();
});

test("delivery applies production privacy, transport, and cache headers to care routes", async ({ request }) => {
  for (const route of new Set(PRODUCTION_ROUTES)) {
    const response = await request.get(route);
    const headers = response.headers();
    expect(response.ok()).toBe(true);
    expect(headers["content-security-policy"]).toContain("connect-src 'self'");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["strict-transport-security"]).toContain("max-age=63072000");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["x-content-type-options"]).toBe("nosniff");
  }
  const worker = await request.get("/sw.js");
  expect(worker.headers()["cache-control"]).toContain("max-age=0");
  expect(worker.headers()["service-worker-allowed"]).toBe("/");
  expect((await request.get("/manifest.webmanifest")).headers()["cache-control"]).toContain("max-age=0");
  expect((await request.get("/icons/icon-512.png")).headers()["cache-control"]).toContain("immutable");
});

test("generated worker has a content build ID, complete precache, and scoped deletion", async ({ request }) => {
  const source = await (await request.get("/sw.js")).text();
  expect(source).not.toContain('CACHE_VERSION = "__BUILD_ID__"');
  expect(source).toContain("/icons/icon-512.png");
  expect(source).toContain("/today/");
  expect(source).toContain("/timeline/");
  expect(source).toContain("/capture/");
  expect(source).toContain("/pass/");
  expect(source).toContain("care-handoff-default-real");
  expect(source).not.toContain("indexedDB.databases");
  expect(source).toContain("Local data deletion did not complete");
});

test("service worker controls the app and serves Today, Timeline, Capture, and Pass offline", async ({ context, page }) => {
  await verifyOfflineCareRoutes(context, page);
  await expect(page.getByRole("dialog", { name: "Update ready" })).toBeHidden();
});
