import type { StoragePort, StorageStatus } from "@/src/ports/StoragePort";

export type BrowserStorageOptions = {
  storageManager?: StorageManager;
  cacheStorage?: CacheStorage;
};

export class BrowserStoragePort implements StoragePort {
  private readonly manager: StorageManager | undefined;
  private readonly cacheStorage: CacheStorage | undefined;

  constructor(options: BrowserStorageOptions = {}) {
    this.manager = options.storageManager ?? globalThis.navigator?.storage;
    this.cacheStorage = options.cacheStorage ?? globalThis.caches;
  }

  async requestPersistence(): Promise<boolean> {
    if (!this.manager?.persist) return false;
    return this.manager.persist();
  }

  async status(): Promise<StorageStatus> {
    if (!this.manager) return { persisted: false };
    const [persisted, estimate] = await Promise.all([
      this.manager.persisted?.() ?? Promise.resolve(false),
      this.manager.estimate?.() ?? Promise.resolve({}),
    ]);
    return {
      persisted,
      ...(typeof estimate.quota === "number" ? { quota: estimate.quota } : {}),
      ...(typeof estimate.usage === "number" ? { usage: estimate.usage } : {}),
    };
  }

  async clearApplicationCaches(): Promise<void> {
    if (!this.cacheStorage) return;
    const names = await this.cacheStorage.keys();
    await Promise.all(names.map((name) => this.cacheStorage?.delete(name)));
  }
}
