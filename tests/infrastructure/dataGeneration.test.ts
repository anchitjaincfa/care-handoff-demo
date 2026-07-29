import { describe, expect, it, vi } from "vitest";
import { BrowserDataGenerationStore, type DataGenerationEventTarget } from "@/src/infrastructure/storage/BrowserDataGenerationStore";
import { BrowserProfileStore } from "@/src/infrastructure/storage/BrowserProfileStore";
import { DATA_GENERATION_STORAGE_KEY } from "@/src/infrastructure/storage/names";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("browser data generation", () => {
  it("reads an absent generation as stable zero without writing", () => {
    const storage = new MemoryStorage();
    const write = vi.spyOn(storage, "setItem");
    const generations = new BrowserDataGenerationStore(storage);
    expect(generations.read()).toBe("0");
    expect(generations.read()).toBe("0");
    expect(write).not.toHaveBeenCalled();
  });

  it("rotates only the expected generation and verifies persistence", () => {
    const storage = new MemoryStorage();
    const generations = new BrowserDataGenerationStore(storage, () => "generation-next");
    expect(generations.rotate("0")).toBe("generation-next");
    expect(storage.getItem(DATA_GENERATION_STORAGE_KEY)).toBe("generation-next");
    expect(() => generations.rotate("0")).toThrow(/deleted or replaced/);
  });

  it("subscribes only to generation changes and removes the listener", () => {
    const storage = new MemoryStorage();
    let storageListener: ((event: StorageEvent) => void) | null = null;
    const eventTarget: DataGenerationEventTarget = {
      addEventListener: (_type, listener) => { storageListener = listener; },
      removeEventListener: (_type, listener) => { if (storageListener === listener) storageListener = null; },
    };
    const observed: string[] = [];
    const generations = new BrowserDataGenerationStore(storage, () => "unused", eventTarget);
    const unsubscribe = generations.subscribe((generation) => { observed.push(generation); });
    const dispatch = (key: string | null, newValue: string | null) => {
      const listener = storageListener as ((event: StorageEvent) => void) | null;
      if (listener) listener({ key, newValue } as StorageEvent);
    };
    dispatch("unrelated", "ignore");
    dispatch(DATA_GENERATION_STORAGE_KEY, "generation-other-tab");
    expect(observed).toEqual(["generation-other-tab"]);
    unsubscribe();
    expect(storageListener).toBeNull();
  });

  it("survives clearing every application profile", () => {
    const storage = new MemoryStorage();
    const generations = new BrowserDataGenerationStore(storage, () => "generation-preserved");
    const real = new BrowserProfileStore("real", storage);
    const demo = new BrowserProfileStore("demo", storage);
    real.write(real.read());
    demo.write(demo.read());
    generations.rotate("0");

    BrowserProfileStore.clearAllApplicationProfiles(storage);

    expect(generations.read()).toBe("generation-preserved");
    expect(real.read().householdId).toBe("real-household");
    expect(demo.read().householdId).toBe("demo-household");
  });
});
