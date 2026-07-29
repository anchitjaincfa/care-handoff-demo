import {
  DATA_GENERATION_STORAGE_KEY,
  DATA_REALMS,
  realmDataGenerationStorageKey,
  type DataRealm,
} from "@/src/infrastructure/storage/names";
import {
  DataGenerationMismatchError,
  INITIAL_DATA_GENERATION,
  sameDataGeneration,
  type DataGenerationSnapshot,
  type DataGenerationStore,
} from "@/src/ports/DataGenerationStore";

type GenerationStorage = Pick<Storage, "getItem" | "setItem">;
export interface DataGenerationEventTarget {
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}
export type BrowserDataGenerationStoreOptions = { watchAllRealms?: boolean; readOnly?: boolean };
function browserStorage(storage?: GenerationStorage): GenerationStorage {
  if (storage) return storage;
  try { if (typeof window === "undefined" || !globalThis.localStorage) throw new Error(); return globalThis.localStorage; }
  catch { throw new Error("Browser data-generation storage requires localStorage."); }
}
function nextGenerationToken(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "generation-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
}
export class BrowserDataGenerationStore implements DataGenerationStore {
  private readonly storage: GenerationStorage;
  private readonly eventTarget: DataGenerationEventTarget | undefined;
  private readonly options: BrowserDataGenerationStoreOptions;
  constructor(
    readonly realm: DataRealm,
    storage?: GenerationStorage,
    private readonly createToken: () => string = nextGenerationToken,
    eventTarget?: DataGenerationEventTarget,
    options: BrowserDataGenerationStoreOptions = {},
  ) {
    this.storage = browserStorage(storage); this.options = options;
    this.eventTarget = eventTarget ?? (typeof window === "undefined" ? undefined : {
      addEventListener: (type, listener) => window.addEventListener(type, listener),
      removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    });
  }
  private readToken(key: string): string {
    const stored = this.storage.getItem(key);
    if (stored === null) return INITIAL_DATA_GENERATION;
    if (!stored.trim()) throw new Error("Browser data generation is invalid");
    return stored;
  }
  read(): DataGenerationSnapshot {
    return { global: this.readToken(DATA_GENERATION_STORAGE_KEY), realm: this.readToken(realmDataGenerationStorageKey(this.realm)) };
  }
  private rotate(expected: DataGenerationSnapshot, target: "global" | "realm"): DataGenerationSnapshot {
    if (this.options.readOnly) throw new Error("This data-generation store is read-only");
    if (!sameDataGeneration(this.read(), expected)) throw new DataGenerationMismatchError();
    const replaced = expected[target], next = this.createToken();
    if (!next.trim() || next === INITIAL_DATA_GENERATION || next === replaced) throw new Error("A fresh browser data generation could not be created");
    this.storage.setItem(target === "global" ? DATA_GENERATION_STORAGE_KEY : realmDataGenerationStorageKey(this.realm), next);
    const persisted = this.read(), desired = { ...expected, [target]: next };
    if (!sameDataGeneration(persisted, desired)) throw new Error("Browser data generation could not be persisted");
    return persisted;
  }
  rotateRealm(expected: DataGenerationSnapshot): DataGenerationSnapshot { return this.rotate(expected, "realm"); }
  rotateGlobal(expected: DataGenerationSnapshot): DataGenerationSnapshot { return this.rotate(expected, "global"); }
  subscribe(listener: (generation: DataGenerationSnapshot | null) => void): () => void {
    if (!this.eventTarget) return () => undefined;
    let active = true; const ownRealmKey = realmDataGenerationStorageKey(this.realm); const allRealmKeys = DATA_REALMS.map(realmDataGenerationStorageKey);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null) { listener(null); return; }
      const ownOrGlobal = event.key === DATA_GENERATION_STORAGE_KEY || event.key === ownRealmKey;
      if (!ownOrGlobal) { if (this.options.watchAllRealms && allRealmKeys.includes(event.key)) listener(null); return; }
      if (event.newValue === null || !event.newValue.trim()) { listener(null); return; }
      try { const current = this.read(); listener(event.key === DATA_GENERATION_STORAGE_KEY ? { ...current, global: event.newValue } : { ...current, realm: event.newValue }); }
      catch { listener(null); }
    };
    this.eventTarget.addEventListener("storage", onStorage);
    return () => { if (!active) return; active = false; this.eventTarget?.removeEventListener("storage", onStorage); };
  }
}
