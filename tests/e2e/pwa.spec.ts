import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { OFFLINE_CARE_ROUTES, verifyOfflineCareRoutes } from "./helpers/journeys";

const PRODUCTION_ROUTES = ["/", ...OFFLINE_CARE_ROUTES.map((route) => route.path.split("#")[0] ?? route.path)] as const;

function updateWorkerFixture(version: string): string {
  return [
    `const VERSION = ${JSON.stringify(version)};`,
    'self.addEventListener("message", (event) => {',
    '  if (event.data?.type === "VERSION") event.ports[0]?.postMessage(VERSION);',
    '  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();',
    "});",
  ].join("\n");
}

async function controlledWorkerVersion(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return null;
    return new Promise<string>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => reject(new Error("Worker version response timed out")), 5_000);
      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(String(event.data));
      };
      controller.postMessage({ type: "VERSION" }, [channel.port2]);
    });
  });
}

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

test("waiting service worker activates in a real browser only after explicit update", async ({ page }) => {
  const fixtureId = `sw-update-${crypto.randomUUID()}`;
  const scopePath = `/${fixtureId}/`;
  const workerPath = `/${fixtureId}.js`;
  const scopeDirectory = path.resolve("out", fixtureId);
  const pageFile = path.join(scopeDirectory, "index.html");
  const workerFile = path.resolve("out", `${fixtureId}.js`);

  await mkdir(scopeDirectory, { recursive: true });
  await writeFile(pageFile, "<!doctype html><title>Service worker update fixture</title>", "utf8");
  await writeFile(workerFile, updateWorkerFixture("v1"), "utf8");

  try {
    await page.goto(scopePath);
    await page.evaluate(async ({ scopePath: scope, workerPath: script }) => {
      await navigator.serviceWorker.register(script, { scope, updateViaCache: "none" });
      await navigator.serviceWorker.ready;
    }, { scopePath, workerPath });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), { timeout: 10_000 }).toBe(true);
    expect(await controlledWorkerVersion(page)).toBe("v1");

    await writeFile(workerFile, updateWorkerFixture("v2"), "utf8");
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) throw new Error("Update fixture registration is missing");
      await registration.update();
    });
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), { timeout: 10_000 }).toBe(true);
    expect(await controlledWorkerVersion(page)).toBe("v1");

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const waiting = registration?.waiting;
      if (!waiting) throw new Error("Updated worker is not waiting");
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Controller change timed out")), 10_000);
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.clearTimeout(timeout);
          resolve();
        }, { once: true });
        waiting.postMessage({ type: "SKIP_WAITING" });
      });
    });
    await expect.poll(() => controlledWorkerVersion(page), { timeout: 10_000 }).toBe("v2");
  } finally {
    await page.evaluate(async (scope) => {
      const registration = await navigator.serviceWorker.getRegistration(new URL(scope, window.location.href).href);
      await registration?.unregister();
    }, scopePath).catch(() => undefined);
    await rm(scopeDirectory, { recursive: true, force: true });
    await rm(workerFile, { force: true });
  }
});

test("service worker controls the app and serves Today, Timeline, Capture, and Pass offline", async ({ context, page }) => {
  await verifyOfflineCareRoutes(context, page);
  await expect(page.getByRole("dialog", { name: "Update ready" })).toBeHidden();
});
