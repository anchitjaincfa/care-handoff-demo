import { closeRegisteredLocalConnections } from "@/src/infrastructure/storage/connectionRegistry";
import { databaseNamesForRealm, KNOWN_APP_DATABASE_NAMES, type DataRealm } from "@/src/infrastructure/storage/names";
import {
  browserLocalStorage,
  clearAppOwnedLocalStorage,
  isAppOwnedCacheName,
  type LocalStorageLike,
} from "@/src/infrastructure/storage/ownership";

export type LocalDeletionResult = { cacheCount: number; databaseCount: number; localStorageCount: number };
type WorkerDeletionResult = Omit<LocalDeletionResult, "localStorageCount">;

type LocalDeletionOptions = {
  cacheStorage?: CacheStorage;
  indexedDb?: IDBFactory;
  localStorage?: LocalStorageLike | null;
};

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Unable to delete ${name}`));
    request.onblocked = () => reject(new Error(`Deletion blocked for ${name}`));
  });
}

function deletionFailure(failures: unknown[]): Error {
  if (failures.length === 1 && failures[0] instanceof Error) return failures[0];
  return new AggregateError(failures, "Local data deletion did not complete");
}

export async function deleteAllLocalData(options: LocalDeletionOptions = {}): Promise<LocalDeletionResult> {
  const cacheStorage = options.cacheStorage ?? globalThis.caches;
  const indexedDb = options.indexedDb ?? globalThis.indexedDB;
  const localStorage = options.localStorage === undefined ? browserLocalStorage() : options.localStorage ?? undefined;
  const failures: unknown[] = [];
  let cacheCount = 0;
  let databaseCount = 0;
  let localStorageCount = 0;

  // Close connections first, then clear synchronous page-only keys before attempting
  // independent async stores. Every surface is attempted even if an earlier one fails.
  try { await closeRegisteredLocalConnections(); } catch (error) { failures.push(error); }
  try { localStorageCount = clearAppOwnedLocalStorage(localStorage); } catch (error) { failures.push(error); }

  if (!cacheStorage) {
    failures.push(new Error("Cache Storage is unavailable"));
  } else {
    try {
      const cacheNames = (await cacheStorage.keys()).filter(isAppOwnedCacheName);
      const results = await Promise.allSettled(cacheNames.map((name) => cacheStorage.delete(name)));
      results.forEach((result) => {
        if (result.status === "fulfilled") cacheCount += 1;
        else failures.push(result.reason);
      });
    } catch (error) {
      failures.push(error);
    }
  }

  if (!indexedDb) {
    failures.push(new Error("IndexedDB is unavailable"));
  } else {
    const results = await Promise.allSettled(KNOWN_APP_DATABASE_NAMES.map((name) => deleteDatabase(indexedDb, name)));
    results.forEach((result) => {
      if (result.status === "fulfilled") databaseCount += 1;
      else failures.push(result.reason);
    });
  }

  if (failures.length) throw deletionFailure(failures);
  return { cacheCount, databaseCount, localStorageCount };
}

/**
 * Removes only the databases owned by one data realm. Shared application
 * caches and localStorage are intentionally untouched so a demo wipe cannot
 * erase a real-family profile or disrupt its offline shell.
 */
export async function deleteRealmLocalData(
  realm: DataRealm,
  options: Pick<LocalDeletionOptions, "indexedDb"> = {},
): Promise<LocalDeletionResult> {
  const indexedDb = options.indexedDb ?? globalThis.indexedDB;
  const failures: unknown[] = [];
  let databaseCount = 0;

  try { await closeRegisteredLocalConnections(); } catch (error) { failures.push(error); }
  if (!indexedDb) {
    failures.push(new Error("IndexedDB is unavailable"));
  } else {
    const results = await Promise.allSettled(databaseNamesForRealm(realm).map((name) => deleteDatabase(indexedDb, name)));
    results.forEach((result) => {
      if (result.status === "fulfilled") databaseCount += 1;
      else failures.push(result.reason);
    });
  }

  if (failures.length) throw deletionFailure(failures);
  return { cacheCount: 0, databaseCount, localStorageCount: 0 };
}

export async function requestServiceWorkerDataDeletion(
  registration: ServiceWorkerRegistration,
  timeoutMs = 10_000,
  localStorage: LocalStorageLike | undefined = browserLocalStorage(),
): Promise<LocalDeletionResult> {
  const failures: unknown[] = [];
  let localStorageCount = 0;
  try { await closeRegisteredLocalConnections(); } catch (error) { failures.push(error); }
  // The worker cannot access localStorage, so page-owned keys are cleared regardless
  // of whether worker-side Cache Storage or IndexedDB deletion succeeds.
  try { localStorageCount = clearAppOwnedLocalStorage(localStorage); } catch (error) { failures.push(error); }

  const worker = registration.active ?? registration.waiting ?? registration.installing;
  if (!worker) {
    failures.push(new Error("No service worker is available for deletion"));
    throw deletionFailure(failures);
  }

  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    const finishFailure = (error: unknown) => {
      channel.port1.close();
      reject(deletionFailure([...failures, error]));
    };
    const timeout = setTimeout(() => finishFailure(new Error("Service-worker deletion timed out")), timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<{ ok: boolean; deleted?: WorkerDeletionResult; error?: string }>) => {
      clearTimeout(timeout);
      if (!event.data.ok || !event.data.deleted) {
        finishFailure(new Error(event.data.error ?? "Service-worker deletion failed"));
        return;
      }
      channel.port1.close();
      if (failures.length) {
        reject(deletionFailure(failures));
        return;
      }
      resolve({ ...event.data.deleted, localStorageCount });
    };
    try {
      worker.postMessage({ type: "DELETE_ALL_LOCAL_DATA" }, [channel.port2]);
    } catch (error) {
      clearTimeout(timeout);
      finishFailure(error);
    }
  });
}
