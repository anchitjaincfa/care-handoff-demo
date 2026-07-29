import { DATA_GENERATION_STORAGE_KEY } from "@/src/infrastructure/storage/names";
import { DataGenerationMismatchError, INITIAL_DATA_GENERATION, type DataGenerationStore } from "@/src/ports/DataGenerationStore";

type GenerationStorage = Pick<Storage, "getItem" | "setItem">;

export interface DataGenerationEventTarget {
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}

function browserStorage(storage?: GenerationStorage): GenerationStorage {
  if (storage) return storage;
  try {
    if (typeof window === "undefined" || !globalThis.localStorage) throw new Error();
    return globalThis.localStorage;
  } catch {
    throw new Error("Browser data-generation storage requires localStorage.");
  }
}

function nextGenerationToken(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `generation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class BrowserDataGenerationStore implements DataGenerationStore {
  private readonly storage: GenerationStorage;
  private readonly eventTarget: DataGenerationEventTarget | undefined;
  constructor(
    storage?: GenerationStorage,
    private readonly createToken: () => string = nextGenerationToken,
    eventTarget?: DataGenerationEventTarget,
  ) {
    this.storage = browserStorage(storage);
    this.eventTarget = eventTarget ?? (typeof window === "undefined" ? undefined : {
      addEventListener: (type, listener) => window.addEventListener(type, listener),
      removeEventListener: (type, listener) => window.removeEventListener(type, listener),
    });
  }
  read(): string {
    const stored = this.storage.getItem(DATA_GENERATION_STORAGE_KEY);
    if (stored === null) return INITIAL_DATA_GENERATION;
    if (!stored.trim()) throw new Error("Browser data generation is invalid");
    return stored;
  }
  rotate(expected: string): string {
    if (this.read() !== expected) throw new DataGenerationMismatchError();
    const next = this.createToken();
    if (!next.trim() || next === INITIAL_DATA_GENERATION || next === expected) throw new Error("A fresh browser data generation could not be created");
    this.storage.setItem(DATA_GENERATION_STORAGE_KEY, next);
    if (this.read() !== next) throw new Error("Browser data generation could not be persisted");
    return next;
  }
  subscribe(listener: (generation: string) => void): () => void {
    if (!this.eventTarget) return () => undefined;
    let active = true;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DATA_GENERATION_STORAGE_KEY && event.key !== null) return;
      listener(event.key === null ? INITIAL_DATA_GENERATION : event.newValue ?? INITIAL_DATA_GENERATION);
    };
    this.eventTarget.addEventListener("storage", onStorage);
    return () => {
      if (!active) return;
      active = false;
      this.eventTarget?.removeEventListener("storage", onStorage);
    };
  }
}
