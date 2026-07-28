/* global self, caches, indexedDB */
const CACHE_PREFIX = "nuzzlecue-shell-";
const CACHE_VERSION = "__BUILD_ID__";
const SHELL_CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
const PRECACHE_URLS = /* __PRECACHE_MANIFEST__ */ [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-maskable.svg"
];
const OFFLINE_FALLBACKS = ["/", "/index.html"];

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll([...new Set(PRECACHE_URLS)]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

function cachedNavigationCandidates(url) {
  const path = url.pathname;
  if (path.endsWith("/")) return [path, `${path}index.html`, ...OFFLINE_FALLBACKS];
  return [path, `${path}/`, `${path}/index.html`, ...OFFLINE_FALLBACKS];
}

async function navigateNetworkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const url = new URL(request.url);
    for (const candidate of cachedNavigationCandidates(url)) {
      const response = await cache.match(candidate, { ignoreSearch: true });
      if (response) return response;
    }
    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigateNetworkFirst(request));
    return;
  }
  event.respondWith(cacheFirst(request));
});

async function deleteIndexedDbDatabase(name) {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion blocked for ${name}`));
  });
}

async function deleteAllLocalData() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((name) => caches.delete(name)));
  const knownNames = ["nuzzlecue-metrics"];
  const discovered = typeof indexedDB.databases === "function"
    ? (await indexedDB.databases()).flatMap((entry) => entry.name ? [entry.name] : [])
    : [];
  const databaseNames = [...new Set([...knownNames, ...discovered])];
  await Promise.all(databaseNames.map(deleteIndexedDbDatabase));
  return { cacheCount: cacheNames.length, databaseCount: databaseNames.length };
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (event.data?.type !== "DELETE_ALL_LOCAL_DATA") return;
  event.waitUntil((async () => {
    try {
      const deleted = await deleteAllLocalData();
      event.ports[0]?.postMessage({ ok: true, deleted });
    } catch (error) {
      event.ports[0]?.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : "Deletion failed",
      });
      throw error;
    }
  })());
});
