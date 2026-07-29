import Dexie from "dexie";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { deleteAllLocalData, deleteRealmLocalData, requestServiceWorkerDataDeletion } from "@/src/infrastructure/privacy/deleteAllLocalData";
import { registerClosableLocalConnection } from "@/src/infrastructure/storage/connectionRegistry";
import { databaseNamesForRealm, DATA_GENERATION_STORAGE_KEY, KNOWN_APP_DATABASE_NAMES } from "@/src/infrastructure/storage/names";
import { appLocalStorageKey, type LocalStorageLike } from "@/src/infrastructure/storage/ownership";

function cachesStub(initial = ["nuzzlecue-shell-test", "unrelated-origin-cache"]) {
  const names = new Set(initial);
  return {
    storage: { keys: async () => [...names], delete: async (name: string) => names.delete(name) } as unknown as CacheStorage,
    remaining: () => [...names],
  };
}

function localStorageStub(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  const storage: LocalStorageLike = {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); },
  };
  return { storage, remaining: () => Object.fromEntries(values) };
}

function open(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("events");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe("deleteAllLocalData", () => {
  it("deletes known real/demo data without databases() while preserving unrelated origin storage", async () => {
    const factory = new IDBFactory();
    for (const name of [...KNOWN_APP_DATABASE_NAMES, "unrelated-origin-db"]) (await open(factory, name)).close();
    const hidden = {
      open: factory.open.bind(factory),
      deleteDatabase: factory.deleteDatabase.bind(factory),
      cmp: factory.cmp.bind(factory),
      databases: undefined,
    } as unknown as IDBFactory;
    const cache = cachesStub();
    const local = localStorageStub({
      [appLocalStorageKey("real-capture-canary")]: "private",
      "nuzzlecue-nursery-theme": "true",
      [DATA_GENERATION_STORAGE_KEY]: "generation-before-delete",
      "unrelated-origin-setting": "preserve",
    });
    await expect(deleteAllLocalData({ cacheStorage: cache.storage, indexedDb: hidden, localStorage: local.storage })).resolves.toEqual({
      cacheCount: 1,
      databaseCount: KNOWN_APP_DATABASE_NAMES.length,
      localStorageCount: 2,
    });
    expect((await factory.databases()).flatMap((entry) => entry.name ? [entry.name] : [])).toEqual(["unrelated-origin-db"]);
    expect(cache.remaining()).toEqual(["unrelated-origin-cache"]);
    expect(local.remaining()).toEqual({
      [DATA_GENERATION_STORAGE_KEY]: "generation-before-delete",
      "unrelated-origin-setting": "preserve",
    });
  });

  it("deletes only the demo realm while preserving real-family databases", async () => {
    const factory = new IDBFactory();
    for (const name of [...KNOWN_APP_DATABASE_NAMES, "unrelated-origin-db"]) (await open(factory, name)).close();

    await expect(deleteRealmLocalData("demo", { indexedDb: factory })).resolves.toEqual({
      cacheCount: 0,
      databaseCount: databaseNamesForRealm("demo").length,
      localStorageCount: 0,
    });

    const remaining = (await factory.databases()).flatMap((entry) => entry.name ? [entry.name] : []);
    for (const name of databaseNamesForRealm("demo")) expect(remaining).not.toContain(name);
    for (const name of databaseNamesForRealm("real")) expect(remaining).toContain(name);
    expect(remaining).toContain("unrelated-origin-db");
  });

  it("closes a held-open domain-compatible Dexie connection first", async () => {
    const factory = new IDBFactory();
    const dexie = new Dexie("care-handoff-default-real", { indexedDB: factory, IDBKeyRange });
    dexie.version(1).stores({ events: "++id" });
    await dexie.open();
    let closed = false;
    const unregister = registerClosableLocalConnection({ close() { dexie.close(); closed = true; } });
    const cache = cachesStub([]);
    await expect(deleteAllLocalData({ cacheStorage: cache.storage, indexedDb: factory, localStorage: null })).resolves.toEqual(expect.objectContaining({ databaseCount: 6 }));
    expect(closed).toBe(true);
    expect((await factory.databases()).map((entry) => entry.name)).not.toContain("care-handoff-default-real");
    unregister();
  });

  it("locks deletion to the reviewed default namespace", async () => {
    const factory = new IDBFactory();
    const future = "care-handoff-household-real";
    (await open(factory, future)).close();
    const cache = cachesStub([]);
    await deleteAllLocalData({ cacheStorage: cache.storage, indexedDb: factory, localStorage: null });
    expect((await factory.databases()).map((entry) => entry.name)).toContain(future);
  });

  it("clears app localStorage and attempts databases even when cache deletion fails", async () => {
    const factory = new IDBFactory();
    (await open(factory, "care-handoff-default-real")).close();
    const local = localStorageStub({ [appLocalStorageKey("real-private")]: "secret", unrelated: "preserve" });
    const cacheStorage = {
      keys: async () => ["nuzzlecue-shell-failing"],
      delete: async () => { throw new Error("cache deletion failed"); },
    } as unknown as CacheStorage;
    await expect(deleteAllLocalData({ cacheStorage, indexedDb: factory, localStorage: local.storage })).rejects.toThrow("cache deletion failed");
    expect(local.remaining()).toEqual({ unrelated: "preserve" });
    expect((await factory.databases()).map((entry) => entry.name)).not.toContain("care-handoff-default-real");
  });

  it("clears page-only app keys even when service-worker deletion fails", async () => {
    const local = localStorageStub({ [appLocalStorageKey("real-private")]: "secret", unrelated: "preserve" });
    const worker = {
      postMessage: (_message: unknown, transfer: Transferable[]) => {
        (transfer[0] as MessagePort).postMessage({ ok: false, error: "worker cache deletion failed" });
      },
    } as unknown as ServiceWorker;
    const registration = { active: worker } as unknown as ServiceWorkerRegistration;
    await expect(requestServiceWorkerDataDeletion(registration, 1_000, local.storage)).rejects.toThrow("worker cache deletion failed");
    expect(local.remaining()).toEqual({ unrelated: "preserve" });
  });
});
