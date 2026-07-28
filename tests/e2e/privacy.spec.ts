import { expect, test } from "@playwright/test";
import { exercisePrivacyCanary, seedCaptureCanaryThroughUi } from "./helpers/privacyCanary";
import { exportedRoutes } from "./routes";

test.describe.configure({ retries: 0 });

for (const route of exportedRoutes()) test(`${route} makes no cross-origin requests`, async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const egress = new Set<string>();
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) egress.add(url.href);
  });
  await page.goto(route, { waitUntil: "networkidle" });
  await page.waitForTimeout(250);
  expect([...egress]).toEqual([]);
});

test("actual capture text never enters any request URL, header, or body", async ({ page }) => {
  const token = `PRIVATE_EVENT_CANARY_${crypto.randomUUID()}`;
  await exercisePrivacyCanary(page, token, seedCaptureCanaryThroughUi);
});

test("delete-all clears only app-owned caches and known real/demo databases", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  const result = await page.evaluate(async () => {
    await caches.open("nuzzlecue-shell-privacy-delete-canary").then((cache) => cache.put("/privacy-delete-canary", new Response("canary")));
    await caches.open("unrelated-origin-cache").then((cache) => cache.put("/unrelated-canary", new Response("preserve")));
    const names = ["care-handoff-default-real", "care-handoff-default-demo", "care-handoff-metrics-real", "care-handoff-metrics-demo", "care-handoff-real", "care-handoff-demo"];
    const unrelated = "unrelated-origin-db";
    for (const name of [...names, unrelated]) await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("canary");
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const registration = await navigator.serviceWorker.ready;
    const response = await new Promise<{ ok: boolean }>((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error("Deletion timed out")), 10_000);
      channel.port1.onmessage = (event) => { clearTimeout(timeout); resolve(event.data); };
      registration.active?.postMessage({ type: "DELETE_ALL_LOCAL_DATA" }, [channel.port2]);
    });
    return {
      response,
      caches: await caches.keys(),
      remaining: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).flatMap((db) => db.name ? [db.name] : []) : [],
      names,
      unrelated,
    };
  });
  expect(result.response).toEqual(expect.objectContaining({ ok: true }));
  expect(result.caches).not.toContain("nuzzlecue-shell-privacy-delete-canary");
  expect(result.caches).toContain("unrelated-origin-cache");
  for (const name of result.names) expect(result.remaining).not.toContain(name);
  expect(result.remaining).toContain(result.unrelated);
});
