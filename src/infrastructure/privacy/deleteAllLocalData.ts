import { closeRegisteredLocalConnections } from "@/src/infrastructure/storage/connectionRegistry";
import { KNOWN_APP_DATABASE_NAMES } from "@/src/infrastructure/storage/names";
import {
  browserLocalStorage,
  clearAppOwnedLocalStorage,
  isAppOwnedCacheName,
  isAppOwnedDatabaseName,
  type LocalStorageLike,
} from "@/src/infrastructure/storage/ownership";

export type LocalDeletionResult = { cacheCount: number; databaseCount: number; localStorageCount: number };
type WorkerDeletionResult = Omit<LocalDeletionResult, "localStorageCount">;

type LocalDeletionOptions = {
  cacheStorage?: CacheStorage;
  indexedDb?: IDBFactory;
  localStorage?: LocalStorageLike | null;
  knownDatabaseNames?: readonly string[];
};

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion blocked for ${name}`));
  });
}

export async function deleteAllLocalData(options: LocalDeletionOptions = {}): Promise<LocalDeletionResult> {
  const cacheStorage = options.cacheStorage ?? globalThis.caches;
  const indexedDb = options.indexedDb ?? globalThis.indexedDB;
  const localStorage = options.localStorage === undefined ? browserLocalStorage() : options.localStorage ?? undefined;
  if (!cacheStorage || !indexedDb) throw new Error("Browser storage APIs are unavailable");

  await closeRegisteredLocalConnections();
  const allCacheNames = await cacheStorage.keys();
  const cacheNames = allCacheNames.filter(isAppOwnedCacheName);
  await Promise.all(cacheNames.map((name) => cacheStorage.delete(name)));

  const explicitNames = [...new Set([...KNOWN_APP_DATABASE_NAMES, ...(options.knownDatabaseNames ?? [])])];
  const databaseNames = explicitNames.filter((name) => isAppOwnedDatabaseName(name, options.knownDatabaseNames));
  await Promise.all(databaseNames.map((name) => deleteDatabase(indexedDb, name)));
  const localStorageCount = clearAppOwnedLocalStorage(localStorage);
  return { cacheCount: cacheNames.length, databaseCount: databaseNames.length, localStorageCount };
}

export async function requestServiceWorkerDataDeletion(
  registration: ServiceWorkerRegistration,
  timeoutMs = 10_000,
  localStorage: LocalStorageLike | undefined = browserLocalStorage(),
): Promise<LocalDeletionResult> {
  await closeRegisteredLocalConnections();
  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) throw new Error("No service worker is available for deletion");
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Service-worker deletion timed out")), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<{ ok: boolean; deleted?: WorkerDeletionResult; error?: string }>) => {
      clearTimeout(timeout);
      channel.port1.close();
      if (!event.data.ok || !event.data.deleted) {
        reject(new Error(event.data.error ?? "Service-worker deletion failed"));
        return;
      }
      try {
        resolve({ ...event.data.deleted, localStorageCount: clearAppOwnedLocalStorage(localStorage) });
      } catch (error) {
        reject(error);
      }
    };
    worker.postMessage({ type: "DELETE_ALL_LOCAL_DATA" }, [channel.port2]);
  });
}
