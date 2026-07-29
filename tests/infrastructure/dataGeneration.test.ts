import { describe, expect, it, vi } from "vitest";
import { BrowserDataGenerationStore } from "@/src/infrastructure/storage/BrowserDataGenerationStore";
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
