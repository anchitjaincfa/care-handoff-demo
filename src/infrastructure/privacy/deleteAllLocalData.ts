import { METRICS_DATABASE_NAME } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";

export type LocalDeletionResult = {
  cacheCount: number;
  databaseCount: number;
};

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion blocked for ${name}`));
  });
}

export async function deleteAllLocalData(options: {
  cacheStorage?: CacheStorage;
  indexedDb?: IDBFactory;
  knownDatabaseNames?: readonly string[];
} = {}): Promise<LocalDeletionResult> {
  const cacheStorage = options.cacheStorage ?? globalThis.caches;
  const indexedDb = options.indexedDb ?? globalThis.indexedDB;
  if (!cacheStorage || !indexedDb) throw new Error("Browser storage APIs are unavailable");

  const cacheNames = await cacheStorage.keys();
  await Promise.all(cacheNames.map((name) => cacheStorage.delete(name)));
  const discovered = typeof indexedDb.databases === "function"
    ? (await indexedDb.databases()).flatMap((entry) => entry.name ? [entry.name] : [])
    : [];
  const databaseNames = [...new Set([
    METRICS_DATABASE_NAME,
    ...(options.knownDatabaseNames ?? []),
    ...discovered,
  ])];
  await Promise.all(databaseNames.map((name) => deleteDatabase(indexedDb, name)));
  return { cacheCount: cacheNames.length, databaseCount: databaseNames.length };
}

export async function requestServiceWorkerDataDeletion(
  registration: ServiceWorkerRegistration,
  timeoutMs = 10_000,
): Promise<LocalDeletionResult> {
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) throw new Error("No service worker is available for deletion");
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Service-worker deletion timed out")), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<{
      ok: boolean;
      deleted?: LocalDeletionResult;
      error?: string;
    }>) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (event.data.ok && event.data.deleted) resolve(event.data.deleted);
      else reject(new Error(event.data.error ?? "Service-worker deletion failed"));
    };
    worker.postMessage({ type: "DELETE_ALL_LOCAL_DATA" }, [channel.port2]);
  });
}
