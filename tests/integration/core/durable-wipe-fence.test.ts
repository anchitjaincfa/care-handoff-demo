import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, expect, it, vi } from "vitest";
import { DexieEventRepository } from "@/src/adapters/DexieEventRepository";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { encodeHandoffFragment, generateHandoffPayload } from "@/src/domain/handoff";
import { deleteAllLocalData, deleteRealmLocalData } from "@/src/infrastructure/privacy/deleteAllLocalData";
import { IndexedDbMetricsPort } from "@/src/infrastructure/metrics/IndexedDbMetricsPort";
import { BrowserDataGenerationStore } from "@/src/infrastructure/storage/BrowserDataGenerationStore";
import { BrowserProfileStore } from "@/src/infrastructure/storage/BrowserProfileStore";
import { registerClosableLocalConnection } from "@/src/infrastructure/storage/connectionRegistry";
import { databaseNamesForRealm, KNOWN_APP_DATABASE_NAMES, type DataRealm } from "@/src/infrastructure/storage/names";
import type { ClockPort } from "@/src/ports/ClockPort";
import type { EventRepository } from "@/src/ports/EventRepository";
import type { IdentityMutationLock } from "@/src/ports/IdentityMutationLock";
import type { MetricEntry, MetricsPort } from "@/src/ports/MetricsPort";
import type { SpeechPort } from "@/src/ports/SpeechPort";
import type { StoragePort } from "@/src/ports/StoragePort";
import { createExperienceRuntime } from "@/src/integration";
import { feedEvent } from "@/tests/domain/fixtures";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class SharedExclusiveIdentityLock implements IdentityMutationLock {
  private readonly tails = new Map<string, Promise<void>>();
  globalRequests = 0;
  readonly available = true;

  private async acquire<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (name === "global") this.globalRequests += 1;
    const previous = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.tails.set(name, tail);
    await previous;
    try { return await work(); }
    finally {
      release();
      if (this.tails.get(name) === tail) this.tails.delete(name);
    }
  }

  runExclusive<T>(realm: DataRealm, work: () => Promise<T>): Promise<T> {
    return this.acquire("global", () => this.acquire(realm, work));
  }

  runGlobalExclusive<T>(work: () => Promise<T>): Promise<T> {
    return this.acquire("global", work);
  }
}

class MemoryMetrics implements MetricsPort {
  readonly entries: MetricEntry[] = [];
  async record(entry: MetricEntry): Promise<void> { this.entries.push(structuredClone(entry)); }
  async list(): Promise<MetricEntry[]> { return structuredClone(this.entries); }
  async exportJson(): Promise<string> { return JSON.stringify({ entries: this.entries }); }
  async clear(): Promise<void> { this.entries.length = 0; }
}

const clock: ClockPort = {
  now: () => "2026-07-29T12:00:00.000Z",
  timeZone: () => "America/Los_Angeles",
  wallClock: () => "2026-07-29T05:00:00",
};
const speech: SpeechPort = {
  capability: async (language) => ({ available: false, locality: "unavailable", language }),
  start: async () => undefined,
  stop: () => undefined,
  cancel: () => undefined,
};
const storagePort: StoragePort = {
  requestPersistence: async () => false,
  status: async () => ({ persisted: false }),
  clearApplicationCaches: async () => undefined,
};
const emptyCaches = { keys: async () => [], delete: async () => true } as unknown as CacheStorage;

function deletionGate() {
  let release!: () => void;
  let signalStarted!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { signalStarted = resolve; });
  return { blocked, started, release, signalStarted };
}

function createRuntime(input: {
  repository: EventRepository;
  metrics: MetricsPort;
  profileStorage: MemoryStorage;
  identityLock: IdentityMutationLock;
  deleteAllData?: () => Promise<unknown>;
  onDispose?: () => void;
}) {
  const profileStore = new BrowserProfileStore("real", input.profileStorage, "America/Los_Angeles");
  return createExperienceRuntime({
    mode: "real",
    repository: input.repository,
    profileStore,
    dataGenerationStore: new BrowserDataGenerationStore("real", input.profileStorage),
    identityLock: input.identityLock,
    clock,
    speech,
    storage: storagePort,
    metrics: input.metrics,
    origin: "https://care.example",
    download: () => undefined,
    deleteAllData: input.deleteAllData ?? (async () => undefined),
    clearAllProfiles: () => BrowserProfileStore.clearAllApplicationProfiles(input.profileStorage),
    onDispose: input.onDispose,
  });
}

async function knownDatabases(): Promise<string[]> {
  const known = new Set<string>(KNOWN_APP_DATABASE_NAMES);
  return (await indexedDB.databases()).flatMap((database) => database.name && known.has(database.name) ? [database.name] : []);
}

function rawDatabase(name: string): Dexie {
  const database = new Dexie(name);
  database.version(4).stores({
    events: "id,householdId,babyId,startedAt,deletedAt,provenance,[householdId+startedAt],[householdId+babyId+startedAt]",
    quarantine: "&recordId,householdId,quarantinedAt",
  });
  return database;
}

describe("durable generation fence inverse wipe regressions", () => {
  it("deletes demo production connections while the same real repository and metrics stay live", async () => {
    const realRepository = new DexieEventRepository({ mode: "real" });
    const demoRepository = new DexieEventRepository({ mode: "demo" });
    const realMetrics = new IndexedDbMetricsPort("real");
    const demoMetrics = new IndexedDbMetricsPort("demo");
    const realClose = vi.spyOn(realRepository, "close");
    const demoClose = vi.spyOn(demoRepository, "close");
    const realMetricsClose = vi.spyOn(realMetrics, "close");
    const demoMetricsClose = vi.spyOn(demoMetrics, "close");
    const unregisterReal = registerClosableLocalConnection("real", realRepository);
    const unregisterDemo = registerClosableLocalConnection("demo", demoRepository);
    try {
      await realRepository.append(feedEvent({ id: "real-before-demo-wipe", householdId: "real-household", babyId: "real-baby" }));
      await demoRepository.append(feedEvent({ id: "demo-before-demo-wipe", householdId: "demo-household", babyId: "demo-baby", provenance: "demo" }));
      await realMetrics.record({ name: "capture_manual", at: clock.now() });
      await demoMetrics.record({ name: "capture_manual", at: clock.now() });
      await expect(deleteRealmLocalData("demo", { indexedDb: indexedDB })).resolves.toEqual({ cacheCount: 0, databaseCount: databaseNamesForRealm("demo").length, localStorageCount: 0 });
      expect(realClose).not.toHaveBeenCalled();
      expect(realMetricsClose).not.toHaveBeenCalled();
      expect(demoClose).toHaveBeenCalledOnce();
      expect(demoMetricsClose).toHaveBeenCalledOnce();
      const remaining = (await indexedDB.databases()).map((entry) => entry.name);
      for (const name of databaseNamesForRealm("demo")) expect(remaining).not.toContain(name);
      expect(await realRepository.list({ householdId: "real-household" })).toHaveLength(1);
      await realRepository.append(feedEvent({ id: "real-after-demo-wipe", householdId: "real-household", babyId: "real-baby" }));
      expect(await realRepository.list({ householdId: "real-household" })).toHaveLength(2);
      await realMetrics.record({ name: "capture_manual", at: "2026-07-29T12:01:00.000Z" });
      expect(await realMetrics.list()).toHaveLength(2);
    } finally {
      unregisterReal();
      unregisterDemo();
      await Promise.allSettled([realMetrics.dispose(), demoMetrics.dispose()]);
      realRepository.close();
      demoRepository.close();
      await deleteAllLocalData({ cacheStorage: emptyCaches, indexedDb: indexedDB, localStorage: null });
    }
  });

  it("fences a metric write queued behind wipe and leaves every app database absent", async () => {
    const profileStorage = new MemoryStorage();
    const identityLock = new SharedExclusiveIdentityLock();
    const staleMetrics = new IndexedDbMetricsPort("real");
    const wiperMetrics = new IndexedDbMetricsPort("real");
    const stale = createRuntime({ repository: new InMemoryEventRepository({ mode: "real" }), metrics: staleMetrics, profileStorage, identityLock });
    const gate = deletionGate();
    const wiper = createRuntime({
      repository: new InMemoryEventRepository({ mode: "real" }),
      metrics: wiperMetrics,
      profileStorage,
      identityLock,
      deleteAllData: async () => {
        gate.signalStarted();
        await gate.blocked;
        await deleteAllLocalData({ cacheStorage: emptyCaches, indexedDb: indexedDB, localStorage: profileStorage });
      },
    });
    await Promise.all([stale.initialize(), wiper.initialize()]);
    const record = vi.spyOn(staleMetrics, "record");
    const fragment = encodeHandoffFragment(generateHandoffPayload({
      events: [],
      provenance: "real",
      generatedAt: clock.now(),
      babyLabel: "Baby",
      timeZone: clock.timeZone(),
      shiftStart: clock.now(),
      shiftEnd: clock.now(),
    }), "url");
    const requestsBeforeWipe = identityLock.globalRequests;

    const wipe = wiper.wipe("DELETE");
    await gate.started;
    const queuedMetric = stale.openPass(fragment);
    await vi.waitFor(() => { expect(identityLock.globalRequests).toBe(requestsBeforeWipe + 2); });
    expect(record).not.toHaveBeenCalled();

    gate.release();
    await expect(wipe).resolves.toBe(true);
    await queuedMetric;

    expect(stale.isTerminated).toBe(true);
    expect(record).not.toHaveBeenCalled();
    expect(await knownDatabases()).toEqual([]);
    await Promise.all([stale.dispose(), wiper.dispose()]);
  });

  it("fences queued list-triggered quarantine persistence without reopening the deleted care database", async () => {
    const profileStorage = new MemoryStorage();
    const identityLock = new SharedExclusiveIdentityLock();
    const staleRepository = new DexieEventRepository({ mode: "real" });
    const wiperRepository = new DexieEventRepository({ mode: "real" });
    const unregisterStale = registerClosableLocalConnection("real", staleRepository);
    const unregisterWiper = registerClosableLocalConnection("real", wiperRepository);
    const stale = createRuntime({ repository: staleRepository, metrics: new MemoryMetrics(), profileStorage, identityLock, onDispose: unregisterStale });
    const gate = deletionGate();
    const wiper = createRuntime({
      repository: wiperRepository,
      metrics: new MemoryMetrics(),
      profileStorage,
      identityLock,
      onDispose: unregisterWiper,
      deleteAllData: async () => {
        gate.signalStarted();
        await gate.blocked;
        await deleteAllLocalData({ cacheStorage: emptyCaches, indexedDb: indexedDB, localStorage: profileStorage });
      },
    });
    await Promise.all([stale.initialize(), wiper.initialize()]);

    const raw = rawDatabase(staleRepository.name);
    const corrupt = { ...feedEvent({ id: "queued-corrupt-event", householdId: "real-household", babyId: "real-baby" }), babyId: null };
    await raw.table("events").put(corrupt);
    expect(await raw.table("quarantine").count()).toBe(0);
    raw.close();
    const exportEvents = vi.spyOn(staleRepository, "export");
    const staleControllers = stale.getSnapshot();
    const requestsBeforeWipe = identityLock.globalRequests;

    const wipe = wiper.wipe("DELETE");
    await gate.started;
    const queuedQuarantine = staleControllers.privacy.onExport("json");
    await vi.waitFor(() => { expect(identityLock.globalRequests).toBe(requestsBeforeWipe + 2); });
    expect(exportEvents).not.toHaveBeenCalled();

    gate.release();
    await expect(wipe).resolves.toBe(true);
    await queuedQuarantine;

    expect(stale.isTerminated).toBe(true);
    expect(exportEvents).not.toHaveBeenCalled();
    expect(stale.getSnapshot().privacy.exportPhase).toBe("error");
    expect(await knownDatabases()).toEqual([]);
    await Promise.all([stale.dispose(), wiper.dispose()]);
  });
});
