import { describe, expect, it } from "vitest";
import { BrowserDataGenerationStore, type DataGenerationEventTarget } from "@/src/infrastructure/storage/BrowserDataGenerationStore";
import { DATA_GENERATION_STORAGE_KEY, realmDataGenerationStorageKey } from "@/src/infrastructure/storage/names";
import { DataGenerationMismatchError } from "@/src/ports/DataGenerationStore";
class MemoryStorage implements Storage {
  private values = new Map<string, string>(); get length() { return this.values.size; } clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; } key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); } setItem(key: string, value: string): void { this.values.set(key, value); }
}
class GenerationEvents implements DataGenerationEventTarget {
  private listeners = new Set<(event: StorageEvent) => void>();
  addEventListener(_type: "storage", listener: (event: StorageEvent) => void): void { this.listeners.add(listener); }
  removeEventListener(_type: "storage", listener: (event: StorageEvent) => void): void { this.listeners.delete(listener); }
  dispatch(key: string | null, newValue: string | null): void { for (const listener of this.listeners) listener({ key, newValue } as StorageEvent); }
}
describe("composite browser data generation", () => {
  it("keeps absent components stable and CAS-rotates only the selected component", () => {
    const storage = new MemoryStorage(), tokens = ["demo-next", "global-next"];
    const store = new BrowserDataGenerationStore("demo", storage, () => tokens.shift() ?? "unexpected");
    const initial = store.read(); expect(initial).toEqual({ global: "0", realm: "0" });
    const realm = store.rotateRealm(initial); expect(realm).toEqual({ global: "0", realm: "demo-next" });
    expect(() => store.rotateGlobal(initial)).toThrow(DataGenerationMismatchError);
    expect(store.rotateGlobal(realm)).toEqual({ global: "global-next", realm: "demo-next" });
  });
  it("routes global and own-realm events, ignores the other realm, and lets a read-only viewer watch all", () => {
    const storage = new MemoryStorage(), events = new GenerationEvents();
    const real = new BrowserDataGenerationStore("real", storage, () => "unused-real", events);
    const demo = new BrowserDataGenerationStore("demo", storage, () => "unused-demo", events);
    const viewer = new BrowserDataGenerationStore("real", storage, () => "must-not-write", events, { watchAllRealms: true, readOnly: true });
    const realChanges: unknown[] = [], demoChanges: unknown[] = [], viewerChanges: unknown[] = [];
    real.subscribe((next) => realChanges.push(next)); demo.subscribe((next) => demoChanges.push(next)); viewer.subscribe((next) => viewerChanges.push(next));
    events.dispatch(realmDataGenerationStorageKey("demo"), "demo-next");
    expect(realChanges).toEqual([]); expect(demoChanges).toEqual([{ global: "0", realm: "demo-next" }]); expect(viewerChanges).toEqual([null]);
    events.dispatch(DATA_GENERATION_STORAGE_KEY, "global-next");
    expect(realChanges).toEqual([{ global: "global-next", realm: "0" }]); expect(demoChanges.at(-1)).toEqual({ global: "global-next", realm: "0" }); expect(viewerChanges.at(-1)).toEqual({ global: "global-next", realm: "0" });
    events.dispatch(realmDataGenerationStorageKey("real"), null); expect(realChanges.at(-1)).toBeNull(); expect(viewerChanges.at(-1)).toBeNull();
    events.dispatch(null, null); expect(realChanges.at(-1)).toBeNull(); expect(demoChanges.at(-1)).toBeNull(); expect(viewerChanges.at(-1)).toBeNull();
    expect(() => viewer.rotateGlobal(viewer.read())).toThrow(/read-only/); expect(storage.getItem(DATA_GENERATION_STORAGE_KEY)).toBeNull();
  });
});
