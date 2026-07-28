import { expect, test } from "@playwright/test";
import { exportedRoutes } from "./routes";

for (const route of exportedRoutes()) {
  test(`${route} makes no cross-origin network requests`, async ({ page, baseURL }) => {
    const expectedOrigin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
    const egress = new Set<string>();
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.protocol === "http:" || url.protocol === "https:") {
        if (url.origin !== expectedOrigin) egress.add(url.href);
      }
    });
    await page.goto(route, { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    expect([...egress]).toEqual([]);
  });
}

test("delete-all clears Cache Storage and IndexedDB through the production service worker", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const result = await page.evaluate(async () => {
    await caches.open("privacy-delete-canary").then((cache) => cache.put(
      "/privacy-delete-canary",
      new Response("canary"),
    ));
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("privacy-delete-canary", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("canary");
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const registration = await navigator.serviceWorker.ready;
    const response = await new Promise<{ ok: boolean; error?: string }>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error("Deletion response timed out")), 10_000);
      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };
      registration.active?.postMessage({ type: "DELETE_ALL_LOCAL_DATA" }, [channel.port2]);
    });
    const cacheNames = await caches.keys();
    const databaseNames = typeof indexedDB.databases === "function"
      ? (await indexedDB.databases()).flatMap((database) => database.name ? [database.name] : [])
      : [];
    return { response, cacheNames, databaseNames };
  });

  expect(result.response).toEqual(expect.objectContaining({ ok: true }));
  expect(result.cacheNames).not.toContain("privacy-delete-canary");
  expect(result.databaseNames).not.toContain("privacy-delete-canary");
  expect(result.databaseNames).not.toContain("nuzzlecue-metrics");
});
