/* global self, caches, indexedDB */
const CACHE_PREFIX = "nuzzlecue-shell-";
const CACHE_VERSION = "__BUILD_ID__";
const SHELL_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const PRECACHE_URLS = /* __PRECACHE_MANIFEST__ */ [
  "/", "/index.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"
];
const KNOWN_DATABASE_NAMES = /* __KNOWN_DATABASE_NAMES__ */ [
  "care-handoff-default-real", "care-handoff-default-demo", "care-handoff-metrics-real",
  "care-handoff-metrics-demo", "care-handoff-real", "care-handoff-demo"
];
const OFFLINE_FALLBACKS = ["/", "/index.html"];
async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const results = await Promise.allSettled([...new Set(PRECACHE_URLS)].map(async (url) => {
    const response = await fetch(new Request(url, { cache: "reload" }));
    if (!response.ok) throw new Error(`Precache failed for ${url}: ${response.status}`);
    await cache.put(url, response);
  }));
  const shell = await cache.match("/") ?? await cache.match("/index.html");
  if (!shell) {
    await caches.delete(SHELL_CACHE);
    throw new AggregateError(results.flatMap((result) => result.status === "rejected" ? [result.reason] : []), "Offline shell could not be cached");
  }
  for (const result of results) if (result.status === "rejected") console.warn(result.reason);
}
self.addEventListener("install", (event) => { event.waitUntil(precacheShell()); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});
function navigationCandidates(url) {
  const path = url.pathname;
  return path.endsWith("/") ? [path, `${path}index.html`, ...OFFLINE_FALLBACKS] : [path, `${path}/`, `${path}/index.html`, ...OFFLINE_FALLBACKS];
}
async function navigationNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) await (await caches.open(SHELL_CACHE)).put(request, response.clone());
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    for (const candidate of navigationCandidates(new URL(request.url))) {
      const response = await cache.match(candidate, { ignoreSearch: true });
      if (response) return response;
    }
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await (await caches.open(SHELL_CACHE)).put(request, response.clone());
  return response;
}
self.addEventListener("fetch", (event) => {
  const { request } = event, url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(request.mode === "navigate" ? navigationNetworkFirst(request) : cacheFirst(request));
});
function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion blocked for ${name}`));
  });
}
async function deleteAllLocalData() {
  const failures = [];
  let cacheNames = [];
  let cacheCount = 0;
  let databaseCount = 0;
  try { cacheNames = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX)); }
  catch (error) { failures.push(error); }
  const cacheResults = await Promise.allSettled(cacheNames.map((name) => caches.delete(name)));
  for (const result of cacheResults) result.status === "fulfilled" ? cacheCount += 1 : failures.push(result.reason);
  const databaseResults = await Promise.allSettled(KNOWN_DATABASE_NAMES.map(deleteDatabase));
  for (const result of databaseResults) result.status === "fulfilled" ? databaseCount += 1 : failures.push(result.reason);
  if (failures.length) throw new AggregateError(failures, "Local data deletion did not complete");
  return { cacheCount, databaseCount };
}
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") { self.skipWaiting(); return; }
  if (event.data?.type !== "DELETE_ALL_LOCAL_DATA") return;
  event.waitUntil((async () => {
    try { event.ports[0]?.postMessage({ ok: true, deleted: await deleteAllLocalData() }); }
    catch (error) {
      event.ports[0]?.postMessage({ ok: false, error: error instanceof Error ? error.message : "Deletion failed" });
      throw error;
    }
  })());
});
