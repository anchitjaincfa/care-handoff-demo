import { describe, expect, it, vi } from "vitest";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import { addHours, addMinutes, wallClockForInstant } from "@/src/domain/time";
import { decodeHandoffFragment } from "@/src/domain/handoff";
import type { ClockPort } from "@/src/ports/ClockPort";
import type { IdentityMutationLock } from "@/src/ports/IdentityMutationLock";
import type { MetricEntry, MetricsPort } from "@/src/ports/MetricsPort";
import type { SpeechCapability, SpeechPort } from "@/src/ports/SpeechPort";
import type { StoragePort, StorageStatus } from "@/src/ports/StoragePort";
import { BrowserProfileStore, createDefaultProfile, type BrowserProfile } from "@/src/infrastructure/storage/BrowserProfileStore";
import type { DataRealm } from "@/src/infrastructure/storage/names";
import { BrowserSpeechPort, SpeechAccessError } from "@/src/infrastructure/speech/BrowserSpeechPort";
import { createExperienceRuntime, type ExperienceRuntimeDependencies, type RuntimeDownload } from "@/src/integration";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

class MutableClock implements ClockPort {
  constructor(public instant = "2026-07-28T12:00:00.000Z", public zone = "America/Los_Angeles") {}
  now(): string { return this.instant; }
  timeZone(): string { return this.zone; }
  wallClock(instant: string, timeZone: string): string { return wallClockForInstant(instant, timeZone); }
}

class FakeSpeech implements SpeechPort {
  capabilityCalls = 0;
  capabilityValue: SpeechCapability = { available: false, locality: "unavailable", language: "en-US", reason: "Unavailable in test" };
  private errorListener: ((error: SpeechAccessError) => void) | null = null;
  async capability(language: string): Promise<SpeechCapability> { this.capabilityCalls += 1; return { ...this.capabilityValue, language }; }
  async start(language: string, onFinal: (text: string) => void, onInterim?: (text: string) => void): Promise<void> { void language; void onFinal; void onInterim; }
  setErrorListener(listener: (error: SpeechAccessError) => void): () => void { this.errorListener = listener; return () => { this.errorListener = null; }; }
  emitError(error = new SpeechAccessError("failed", "mid-session failure")): void { this.errorListener?.(error); }
  stop(): void {}
  cancel(): void {}
}

class FakeStorage implements StoragePort {
  persisted = false;
  usage = 2048;
  quota = 8192;
  async requestPersistence(): Promise<boolean> { this.persisted = true; return true; }
  async status(): Promise<StorageStatus> { return { persisted: this.persisted, usage: this.usage, quota: this.quota }; }
  async clearApplicationCaches(): Promise<void> {}
}

class FakeMetrics implements MetricsPort {
  entries: MetricEntry[] = [];
  rejectAfterDelete = false;
  async record(entry: MetricEntry): Promise<void> {
    if (this.rejectAfterDelete) throw new Error("post-delete metric");
    this.entries.push(entry);
  }
  async list(): Promise<MetricEntry[]> { return [...this.entries]; }
  async exportJson(): Promise<string> { return JSON.stringify({ entries: this.entries }); }
  async clear(): Promise<void> { this.entries = []; }
}

class SharedExclusiveIdentityLock implements IdentityMutationLock {
  private readonly tails = new Map<string, Promise<void>>();
  globalRequests = 0;
  constructor(readonly available = true) {}

  private async acquire<T>(name: string, work: () => Promise<T>): Promise<T> {
    if (!this.available) throw new Error("identity lock unavailable");
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

  async runExclusive<T>(realm: DataRealm, work: () => Promise<T>): Promise<T> {
    return this.acquire("global", () => this.acquire(realm, work));
  }

  async runGlobalExclusive<T>(work: () => Promise<T>): Promise<T> {
    return this.acquire("global", work);
  }
}

class DelayedInitializeRepository extends InMemoryEventRepository {
  private releaseList!: () => void;
  private signalListStarted!: () => void;
  private readonly listGate: Promise<void>;
  readonly listStarted: Promise<void>;
  private blockFirstList = true;
  closed = false;
  closeCount = 0;
  callsAfterClose = 0;

  constructor() {
    super({ mode: "real" });
    this.listGate = new Promise((resolve) => { this.releaseList = resolve; });
    this.listStarted = new Promise((resolve) => { this.signalListStarted = resolve; });
  }

  release(): void { this.releaseList(); }
  async list(query: Parameters<InMemoryEventRepository["list"]>[0]): Promise<CareEvent[]> {
    if (this.closed) this.callsAfterClose += 1;
    if (this.blockFirstList) {
      this.blockFirstList = false;
      this.signalListStarted();
      await this.listGate;
    }
    return super.list(query);
  }
  close(): void { this.closed = true; this.closeCount += 1; }
}

class RacingBatchRepository extends InMemoryEventRepository {
  async appendBatch(events: CareEvent[]): Promise<void> {
    if (events.length > 1) await super.appendBatch([events.at(-1) as CareEvent]);
    await super.appendBatch(events);
  }
}

class FailingRestoreRepository extends InMemoryEventRepository {
  async restoreSnapshot(): Promise<void> { throw new Error("simulated restore failure"); }
}

class FailingAdoptRepository extends InMemoryEventRepository {
  async adoptSnapshot(): Promise<void> { throw new Error("simulated adoption failure"); }
}

class DelayedAdoptRepository extends InMemoryEventRepository {
  private releaseAdoption!: () => void;
  private signalAdoptionStarted!: () => void;
  private readonly adoptionGate: Promise<void>;
  readonly adoptionStarted: Promise<void>;

  constructor() {
    super({ mode: "real" });
    this.adoptionGate = new Promise((resolve) => { this.releaseAdoption = resolve; });
    this.adoptionStarted = new Promise((resolve) => { this.signalAdoptionStarted = resolve; });
  }

  release(): void { this.releaseAdoption(); }
  async adoptSnapshot(householdId: string, events: CareEvent[]): Promise<void> {
    this.signalAdoptionStarted();
    await this.adoptionGate;
    await super.adoptSnapshot(householdId, events);
  }
}

class FaultyProfileStore extends BrowserProfileStore {
  writes = 0;
  constructor(storage: Storage, private readonly failingWrites: readonly number[]) { super("real", storage, "America/Los_Angeles"); }
  override write(profile: BrowserProfile): void {
    this.writes += 1;
    if (this.failingWrites.includes(this.writes)) throw new Error("simulated profile write failure");
    super.write(profile);
  }
}

class RefreshFailAfterBatchRepository extends InMemoryEventRepository {
  private failNextList = false;
  async appendBatch(events: CareEvent[]): Promise<void> { await super.appendBatch(events); this.failNextList = true; }
  async list(query: Parameters<InMemoryEventRepository["list"]>[0]): Promise<CareEvent[]> {
    if (this.failNextList) { this.failNextList = false; throw new Error("simulated refresh failure"); }
    return super.list(query);
  }
}

class ArmableListFailureRepository extends InMemoryEventRepository {
  private failNextList = false;
  armListFailure(): void { this.failNextList = true; }
  async list(query: Parameters<InMemoryEventRepository["list"]>[0]): Promise<CareEvent[]> {
    if (this.failNextList) {
      this.failNextList = false;
      throw new Error("simulated identity refresh failure");
    }
    return super.list(query);
  }
}

class DelayedAppendRepository extends InMemoryEventRepository {
  private releaseAppend!: () => void;
  private signalAppendStarted!: () => void;
  private readonly appendGate: Promise<void>;
  readonly appendStarted: Promise<void>;
  closed = false;
  closeCount = 0;
  callsAfterClose = 0;

  constructor() {
    super({ mode: "real" });
    this.appendGate = new Promise((resolve) => { this.releaseAppend = resolve; });
    this.appendStarted = new Promise((resolve) => { this.signalAppendStarted = resolve; });
  }

  release(): void { this.releaseAppend(); }
  async append(event: CareEvent): Promise<void> {
    if (this.closed) this.callsAfterClose += 1;
    this.signalAppendStarted();
    await this.appendGate;
    await super.append(event);
  }
  async list(query: Parameters<InMemoryEventRepository["list"]>[0]): Promise<CareEvent[]> {
    if (this.closed) this.callsAfterClose += 1;
    return super.list(query);
  }
  close(): void { this.closed = true; this.closeCount += 1; }
}

type Harness = {
  runtime: ReturnType<typeof createExperienceRuntime>;
  repository: InMemoryEventRepository;
  profileStore: BrowserProfileStore;
  identityLock: IdentityMutationLock;
  clock: MutableClock;
  metrics: FakeMetrics;
  downloads: RuntimeDownload[];
  storage: MemoryStorage;
};

function harness(overrides: Partial<ExperienceRuntimeDependencies> = {}, storage = new MemoryStorage()): Harness {
  const mode = overrides.mode ?? "real";
  const clock = overrides.clock instanceof MutableClock ? overrides.clock : new MutableClock();
  const profileStore = overrides.profileStore instanceof BrowserProfileStore ? overrides.profileStore : new BrowserProfileStore(mode, storage, clock.zone);
  const repository = overrides.repository instanceof InMemoryEventRepository ? overrides.repository : new InMemoryEventRepository({ mode, now: () => clock.now() });
  const metrics = overrides.metrics instanceof FakeMetrics ? overrides.metrics : new FakeMetrics();
  const identityLock = overrides.identityLock ?? new SharedExclusiveIdentityLock();
  const downloads: RuntimeDownload[] = [];
  let sequence = 0;
  const runtime = createExperienceRuntime({
    mode,
    repository,
    profileStore,
    identityLock,
    clock,
    speech: new FakeSpeech(),
    storage: new FakeStorage(),
    metrics,
    origin: "https://care.example",
    idFactory: () => `event-${(++sequence).toString().padStart(4, "0")}`,
    download: (download) => { downloads.push(download); },
    copyText: () => undefined,
    deleteAllData: async () => undefined,
    clearAllProfiles: () => BrowserProfileStore.clearAllApplicationProfiles(storage),
    ...overrides,
  });
  return { runtime, repository, profileStore, identityLock, clock, metrics, downloads, storage };
}

function completedFeed(index: number, startedAt: string, provenance: "real" | "demo" = "real"): CareEvent {
  return CareEventSchema.parse({
    id: `feed-event-${index.toString().padStart(4, "0")}`,
    householdId: `${provenance}-household`,
    babyId: `${provenance}-baby`,
    type: "feed",
    startedAt,
    endedAt: addMinutes(startedAt, 15),
    timeZone: "America/Los_Angeles",
    enteredWallClock: wallClockForInstant(startedAt, "America/Los_Angeles"),
    fields: { mode: "nursing", durationMinutes: 15 },
    createdAt: startedAt,
    updatedAt: startedAt,
    deletedAt: null,
    schemaVersion: 1,
    captureMethod: "manual",
    provenance,
  });
}

describe("browser speech adapter", () => {
  it("notifies a listener when recognition fails after listening starts", async () => {
    class Recognition {
      static latest: Recognition | null = null;
      lang = ""; continuous = false; interimResults = false; maxAlternatives = 1;
      onstart: (() => void) | null = null;
      onresult: ((event: { resultIndex?: number; results: ArrayLike<never> }) => void) | null = null;
      onerror: ((event: { error?: string }) => void) | null = null;
      onend: (() => void) | null = null;
      constructor() { Recognition.latest = this; }
      start(): void { this.onstart?.(); }
      stop(): void { this.onend?.(); }
      abort(): void { this.onerror?.({ error: "aborted" }); }
      fail(): void { this.onerror?.({ error: "network" }); }
    }
    const speech = new BrowserSpeechPort({ SpeechRecognition: Recognition } as never, undefined);
    await speech.capability("en-US");
    const observed: SpeechAccessError[] = [];
    speech.setErrorListener((error) => { observed.push(error); });
    await speech.start("en-US", () => undefined);
    Recognition.latest?.fail();
    expect(observed[0]).toBeInstanceOf(SpeechAccessError);
    expect(observed[0]?.code).toBe("failed");
  });
});

describe("experience runtime capture and persistence", () => {
  it("performs no event write or eager speech probe while the real runtime initializes", async () => {
    const speech = new FakeSpeech();
    const storagePort = new FakeStorage();
    const { runtime, repository } = harness({ speech, storage: storagePort });
    const append = vi.spyOn(repository, "append");
    const importEvents = vi.spyOn(repository, "import");
    const purge = vi.spyOn(repository, "purgeAll");

    await runtime.initialize();

    expect(append).not.toHaveBeenCalled();
    expect(importEvents).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
    expect(await repository.list({ householdId: "real-household", includeDeleted: true })).toEqual([]);
    expect(speech.capabilityCalls).toBe(0);
    expect(runtime.getSnapshot().privacy.storageEstimate).toEqual({ usageBytes: 2048, quotaBytes: 8192 });
    await runtime.getSnapshot().capture.onProbeSpeech();
    expect(speech.capabilityCalls).toBe(1);
  });

  it("does not write parsed proposals before explicit confirmation, then imports all proposals", async () => {
    const { runtime, repository } = harness();
    await runtime.initialize();
    const capture = runtime.getSnapshot().capture;
    await capture.onSourceTextChange("bottle 3 oz 10 minutes ago; wet diaper now");
    await runtime.getSnapshot().capture.onParse();

    expect((await repository.list({ householdId: "real-household" })).length).toBe(0);
    expect(runtime.getSnapshot().capture.proposals).toHaveLength(2);
    await runtime.getSnapshot().capture.onConfirm();

    const saved = await repository.list({ householdId: "real-household" });
    expect(saved).toHaveLength(2);
    expect(runtime.getSnapshot().capture.stage).toBe("committed");
    expect(runtime.getSnapshot().capture.proposals).toEqual([]);
  });

  it("refuses incomplete proposals without partial writes", async () => {
    const { runtime, repository } = harness();
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("feed now; wet diaper now");
    await runtime.getSnapshot().capture.onParse();
    await runtime.getSnapshot().capture.onConfirm();
    expect(await repository.list({ householdId: "real-household" })).toEqual([]);
    expect(runtime.getSnapshot().capture.stage).toBe("error");
  });

  it("precludes a constant id factory before a multi-event batch can partially import", async () => {
    const { runtime, repository } = harness({ idFactory: () => "constant-event-id" });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("bottle 3 oz now; wet diaper now");
    await runtime.getSnapshot().capture.onParse();
    await runtime.getSnapshot().capture.onConfirm();
    expect(await repository.list({ householdId: "real-household", includeDeleted: true })).toEqual([]);
    expect(runtime.getSnapshot().capture.stage).toBe("error");
  });

  it("rolls back every proposed event when a duplicate appears at the atomic commit boundary", async () => {
    const repository = new RacingBatchRepository({ mode: "real" });
    const { runtime } = harness({ repository });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("bottle 3 oz now; wet diaper now");
    await runtime.getSnapshot().capture.onParse();
    await runtime.getSnapshot().capture.onConfirm();
    const stored = await repository.export("real-household");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).toBe("event-0002");
    expect(runtime.getSnapshot().capture.stage).toBe("error");
  });

  it("keeps a committed batch visible when the post-commit repository refresh fails", async () => {
    const repository = new RefreshFailAfterBatchRepository({ mode: "real" });
    const { runtime } = harness({ repository });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("bottle 3 oz now; wet diaper now");
    await runtime.getSnapshot().capture.onParse();
    await runtime.getSnapshot().capture.onConfirm();
    expect(await repository.list({ householdId: "real-household" })).toHaveLength(2);
    expect(runtime.getSnapshot().today.recentEvents).toHaveLength(2);
    expect(runtime.getSnapshot().capture.stage).toBe("committed");
  });

  it("keeps a committed quick log visible when its repository refresh fails", async () => {
    const repository = new RefreshFailAfterBatchRepository({ mode: "real" });
    const { runtime } = harness({ repository });
    await runtime.initialize();
    await runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    expect(runtime.getSnapshot().today.phase).toBe("success");
    expect(runtime.getSnapshot().today.recentEvents).toHaveLength(1);
    expect(await repository.list({ householdId: "real-household" })).toHaveLength(1);
  });

  it("persists every reviewed manual quick-log field without post-confirmation prompting", async () => {
    const { runtime, repository, clock } = harness();
    await runtime.initialize();
    await runtime.getSnapshot().today.onQuickLog({ kind: "bottle", volume: 3.5, unit: "oz" });
    await runtime.getSnapshot().today.onQuickLog({ kind: "diaper", diaperKind: "both" });
    await runtime.getSnapshot().today.onQuickLog({ kind: "pumping", durationMinutes: 12, volume: 4, unit: "oz" });
    await runtime.getSnapshot().today.onQuickLog({ kind: "solids", food: "banana" });
    await runtime.getSnapshot().today.onQuickLog({ kind: "tummy-time", durationMinutes: 8 });

    const saved = await repository.list({ householdId: "real-household" });
    expect(saved).toHaveLength(5);
    expect(saved.find((event) => event.type === "feed")?.fields).toEqual({ mode: "bottle", volume: 3.5, unit: "oz" });
    expect(saved.find((event) => event.type === "diaper")?.fields).toEqual({ kind: "both" });
    const pumping = saved.find((event) => event.type === "pumping");
    expect(pumping?.fields).toEqual({ durationMinutes: 12, volume: 4, unit: "oz" });
    expect(pumping?.startedAt).toBe(addMinutes(clock.instant, -12));
    expect(pumping?.endedAt).toBe(clock.instant);
    expect(saved.find((event) => event.type === "solids")?.fields).toEqual({ food: "banana" });
    const tummy = saved.find((event) => event.type === "tummy-time");
    expect(tummy?.fields).toEqual({ durationMinutes: 8 });
    expect(tummy?.startedAt).toBe(addMinutes(clock.instant, -8));
    expect(tummy?.endedAt).toBe(clock.instant);
    expect(runtime.getSnapshot().today.recentEvents.find((event) => event.title === "Pumping")?.detail).toBe("4 oz · 12 min");
  });

  it("rejects incomplete structured drafts without a repository write", async () => {
    const { runtime, repository } = harness();
    await runtime.initialize();
    await runtime.quickLog({ kind: "bottle", volume: null, unit: "oz" });
    expect(await repository.list({ householdId: "real-household" })).toEqual([]);
    expect(runtime.getSnapshot().today.phase).toBe("error");
  });

  it("surfaces mid-session speech errors", async () => {
    const speech = new FakeSpeech();
    speech.capabilityValue = { available: true, locality: "browser-service", language: "en-US" };
    const current = harness({ speech });
    await current.runtime.initialize();
    await current.runtime.getSnapshot().capture.onProbeSpeech();
    await current.runtime.getSnapshot().capture.onAcceptSpeechDisclosure();
    expect(current.runtime.getSnapshot().capture.stage).toBe("listening");
    speech.emitError();
    expect(current.runtime.getSnapshot().capture.stage).toBe("error");
    expect(current.runtime.getSnapshot().capture.speech.status).toBe("error");
  });

  it("uses legacy appearance keys only as a first-profile bootstrap", () => {
    const storage = new MemoryStorage();
    const store = new BrowserProfileStore("real", storage, "UTC", { nursery: true, reducedMotion: true });
    expect(store.read().preferences).toEqual({ nursery: true, reducedMotion: true });
    store.write({ ...store.read(), preferences: { nursery: false, reducedMotion: false } });
    expect(new BrowserProfileStore("real", storage, "UTC", { nursery: true, reducedMotion: true }).read().preferences).toEqual({ nursery: false, reducedMotion: false });
  });

  it("keeps realm-scoped profiles isolated and rejects cross-realm writes", () => {
    const storage = new MemoryStorage();
    const real = new BrowserProfileStore("real", storage, "UTC");
    const demo = new BrowserProfileStore("demo", storage, "UTC");
    real.write({ ...createDefaultProfile("real", "UTC"), nickname: "Rae" });
    demo.write({ ...createDefaultProfile("demo", "UTC"), nickname: "Demi" });
    expect(real.read().nickname).toBe("Rae");
    expect(demo.read().nickname).toBe("Demi");
    expect(() => real.write(createDefaultProfile("demo", "UTC"))).toThrow(/Cross-realm/);
  });
});

describe("durable timers and undo", () => {
  it("serializes concurrent starts so exactly one timer opens", async () => {
    const { runtime, repository } = harness();
    await runtime.initialize();
    const outcomes = await Promise.all([runtime.startTimer("sleep"), runtime.startTimer("feed")]);
    expect(outcomes.filter((outcome) => outcome.status === "started")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "overlap")).toHaveLength(1);
    expect(await repository.list({ householdId: "real-household" })).toHaveLength(1);
    expect(runtime.getSnapshot().today.activeTimers).toHaveLength(1);
  });

  it("retains a committed timer after refresh failure and rejects a second start", async () => {
    const repository = new RefreshFailAfterBatchRepository({ mode: "real" });
    const { runtime } = harness({ repository });
    await runtime.initialize();
    const first = await runtime.startTimer("sleep");
    expect(first.status).toBe("started");
    const activeId = first.status === "started" ? first.id : "";
    expect(runtime.getSnapshot().today.activeTimers.map((timer) => timer.id)).toEqual([activeId]);
    expect(await runtime.startTimer("feed")).toEqual({ status: "overlap", activeId });
    expect(await repository.list({ householdId: "real-household" })).toHaveLength(1);
  });

  it("rehydrates an open timer after restart, rejects overlap, stops, and undoes stop", async () => {
    const first = harness();
    await first.runtime.initialize();
    const started = await first.runtime.startTimer("sleep");
    expect(started.status).toBe("started");
    const activeId = started.status === "started" ? started.id : "";

    const restarted = harness({ repository: first.repository, profileStore: first.profileStore, clock: first.clock }, first.storage);
    await restarted.runtime.initialize();
    expect(restarted.runtime.getSnapshot().today.activeTimers.map((timer) => timer.id)).toEqual([activeId]);
    expect(await restarted.runtime.startTimer("feed")).toEqual({ status: "overlap", activeId });

    restarted.clock.instant = addMinutes(restarted.clock.instant, 32);
    await restarted.runtime.stopTimer(activeId);
    expect(restarted.runtime.getSnapshot().today.activeTimers).toHaveLength(0);
    await restarted.runtime.undo();
    expect(restarted.runtime.getSnapshot().today.activeTimers.map((timer) => timer.id)).toEqual([activeId]);
  });

  it("soft-deletes, restores, revises, and undoes timeline changes", async () => {
    const { runtime, repository } = harness();
    await runtime.initialize();
    await runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const id = runtime.getSnapshot().today.recentEvents[0]?.id ?? "";
    runtime.getSnapshot().timeline.onDelete(id);
    await runtime.getSnapshot().timeline.onConfirmDelete();
    expect(runtime.getSnapshot().timeline.groups).toHaveLength(0);
    await runtime.getSnapshot().timeline.onUndo();
    expect(runtime.getSnapshot().timeline.groups[0]?.events[0]?.id).toBe(id);

    runtime.getSnapshot().timeline.onEdit(id);
    const draft = runtime.getSnapshot().timeline.editing;
    const enteredWallClock = (await repository.get("real-household", id))?.enteredWallClock;
    runtime.getSnapshot().timeline.onEditChange({ ...draft?.fields, startedAt: addMinutes(String(draft?.fields.startedAt), 10), "fields.kind": "dirty" });
    await runtime.getSnapshot().timeline.onSaveEdit();
    expect(runtime.getSnapshot().today.recentEvents[0]?.detail).toBe("Dirty");
    expect((await repository.get("real-household", id))?.enteredWallClock).toBe(enteredWallClock);
    await runtime.getSnapshot().today.onUndo();
    expect(runtime.getSnapshot().today.recentEvents[0]?.detail).toBe("Wet");
  });
});

describe("domain-gated runtime insights", () => {
  it("stays forming at 20 complete samples and becomes ready at 21", async () => {
    const atTwenty = harness();
    const samples = Array.from({ length: 21 }, (_, index) => completedFeed(index, addHours(atTwenty.clock.instant, -20 + index)));
    await atTwenty.repository.import("real-household", samples.slice(0, 20));
    await atTwenty.runtime.initialize();
    expect(atTwenty.runtime.getSnapshot().insights.routine.status).toBe("forming");
    expect(atTwenty.runtime.getSnapshot().insights.routine.evidence.stale).toBe(false);
    await atTwenty.repository.import("real-household", samples.slice(20));
    const atTwentyOne = harness({ repository: atTwenty.repository, profileStore: atTwenty.profileStore, clock: atTwenty.clock }, atTwenty.storage);
    await atTwentyOne.runtime.initialize();
    expect(atTwentyOne.runtime.getSnapshot().insights.routine.status).toBe("ready");
    expect(atTwentyOne.runtime.getSnapshot().insights.routine.evidence.stale).toBe(false);
    expect(atTwentyOne.runtime.getSnapshot().insights.nextEvent.status).toBe("ready");
  });

  it("withholds stale predictions even with 21 samples", async () => {
    const stale = harness();
    const events = Array.from({ length: 21 }, (_, index) => completedFeed(index, addHours(stale.clock.instant, -(24 * 40) + index)));
    await stale.repository.import("real-household", events);
    await stale.runtime.initialize();
    expect(stale.runtime.getSnapshot().insights.routine.status).toBe("forming");
    expect(stale.runtime.getSnapshot().insights.routine.evidence.stale).toBe(true);
    expect(stale.runtime.getSnapshot().insights.nextEvent.status).toBe("forming");
    expect(stale.runtime.getSnapshot().insights.nextEvent.evidence.stale).toBe(true);
  });
});

describe("handoff and backup lifecycle", () => {
  it("encodes the exact fully reviewed payload and preserves source-zone clock labels", async () => {
    const source = harness();
    const samples = Array.from({ length: 12 }, (_, index) =>
      completedFeed(100 + index, addMinutes(source.clock.instant, -(15 + index * 20))),
    );
    await source.repository.import("real-household", samples);
    await source.runtime.initialize();

    const reviewedAt = source.clock.instant;
    const reviewed = source.runtime.getSnapshot().handoff;
    expect(reviewed.summary?.feeds).toBe(12);
    expect(reviewed.recentEvents).toHaveLength(12);
    expect(reviewed.artifact.status).toBe("idle");

    source.clock.instant = addHours(source.clock.instant, 1);
    await reviewed.onGenerate("url");
    const artifact = source.runtime.getSnapshot().handoff.artifact;
    expect(artifact.status).toBe("ready");
    if (artifact.status !== "ready") return;
    expect(artifact.byteCount).toBeGreaterThan(new TextEncoder().encode(artifact.fragment).byteLength);
    const payload = decodeHandoffFragment(artifact.fragment);
    expect(payload.generatedAt).toBe(reviewedAt);
    expect(payload.timeZone).toBe(source.clock.zone);
    expect(payload.events).toHaveLength(reviewed.recentEvents.length);

    const viewerClock = new MutableClock(source.clock.instant, "Asia/Tokyo");
    const viewer = harness({ clock: viewerClock });
    await viewer.runtime.initialize();
    const valid = await viewer.runtime.openPass(artifact.fragment);
    expect(valid.status).toBe("valid");
    if (valid.status === "valid") {
      expect(valid.generatedLabel).toMatch(/^Generated /);
      expect(valid.expiryLabel).toMatch(/^Expires /);
      expect(valid.events.map((event) => event.timeLabel)).toEqual(reviewed.recentEvents.map((event) => event.timeLabel));
    }
    expect(viewer.runtime.getSnapshot().settings.availableTimeZones).toContain(viewer.clock.zone);
    viewer.clock.instant = payload.expiresAt;
    expect((await viewer.runtime.openPass(artifact.fragment)).status).toBe("expired");
  });

  it("exports profile and events, requires exact DELETE, wipes, and restores into an empty runtime", async () => {
    const original = harness();
    original.profileStore.write({ ...original.profileStore.read(), householdId: "source-household", babyId: "source-baby" });
    await original.runtime.initialize();
    const settings = original.runtime.getSnapshot().settings;
    await settings.onProfileSave({ ...settings.profile, nickname: "Mina" });
    await original.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    await original.runtime.getSnapshot().privacy.onExport("json");
    const backup = original.downloads[0];
    expect(backup?.name.endsWith(".json")).toBe(true);
    const text = await backup?.data.text();
    expect(text).toContain('"nickname": "Mina"');

    expect(await original.runtime.wipe("delete")).toBe(false);
    expect(original.runtime.isTerminated).toBe(false);
    let deletionCalled = false;
    const metrics = original.metrics;
    const wipeRuntime = createExperienceRuntime({
      mode: "real",
      repository: original.repository,
      profileStore: original.profileStore,
      identityLock: new SharedExclusiveIdentityLock(),
      clock: original.clock,
      speech: new FakeSpeech(),
      storage: new FakeStorage(),
      metrics,
      deleteAllData: async () => { deletionCalled = true; metrics.rejectAfterDelete = true; },
      clearAllProfiles: () => BrowserProfileStore.clearAllApplicationProfiles(original.storage),
    });
    await wipeRuntime.initialize();
    expect(await wipeRuntime.wipe("DELETE")).toBe(true);
    expect(deletionCalled).toBe(true);
    expect(wipeRuntime.isTerminated).toBe(true);
    expect(metrics.entries.at(-1)?.name).toBe("delete_all_completed");
    expect(original.profileStore.read().nickname).toBe("Baby");

    const restored = harness();
    await restored.runtime.initialize();
    await restored.runtime.getSnapshot().privacy.onChooseImport({ name: "backup.json", text: text ?? "" });
    expect(restored.runtime.getSnapshot().privacy.importState.status).toBe("review");
    await restored.runtime.getSnapshot().privacy.onConfirmImport();
    expect(restored.runtime.getSnapshot().settings.profile.nickname).toBe("Mina");
    expect(restored.runtime.getSnapshot().today.recentEvents).toHaveLength(1);
  });

  it("shares initialize/dispose promises and closes only after initialization quiesces", async () => {
    const repository = new DelayedInitializeRepository();
    const guarded = harness({ repository });
    const firstInitialize = guarded.runtime.initialize();
    const secondInitialize = guarded.runtime.initialize();
    expect(secondInitialize).toBe(firstInitialize);
    await repository.listStarted;

    const firstDispose = guarded.runtime.dispose();
    const secondDispose = guarded.runtime.dispose();
    expect(secondDispose).toBe(firstDispose);
    expect(repository.closeCount).toBe(0);
    repository.release();

    await expect(firstInitialize).rejects.toThrow(/no longer active/);
    await firstDispose;
    expect(guarded.runtime.isInitialized).toBe(false);
    expect(repository.closeCount).toBe(1);
    expect(repository.callsAfterClose).toBe(0);
    await expect(guarded.runtime.quickLog({ kind: "diaper", diaperKind: "wet" })).rejects.toThrow(/no longer active/);
    expect(repository.callsAfterClose).toBe(0);
  });

  it("terminalizes wipe synchronously while an earlier mutation drains", async () => {
    const repository = new DelayedAppendRepository();
    let deletionCalls = 0;
    const guarded = harness({ repository, deleteAllData: async () => { deletionCalls += 1; } });
    const append = vi.spyOn(repository, "append");
    const profileWrite = vi.spyOn(guarded.profileStore, "write");
    await guarded.runtime.initialize();

    const earlierMutation = guarded.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    await repository.appendStarted;
    const beforeWipe = guarded.runtime.getSnapshot();
    const wipe = guarded.runtime.wipe("DELETE");

    await expect(guarded.runtime.quickLog({ kind: "diaper", diaperKind: "wet" })).rejects.toThrow(/no longer active/);
    expect(() => beforeWipe.settings.onPreferenceChange("nursery", true)).toThrow(/no longer active/);
    expect(() => beforeWipe.handoff.onBoundaryChange("4")).toThrow(/no longer active/);
    expect(deletionCalls).toBe(0);

    repository.release();
    await earlierMutation;
    await expect(wipe).resolves.toBe(true);
    expect(deletionCalls).toBe(1);
    expect(append).toHaveBeenCalledTimes(1);
    expect(profileWrite).not.toHaveBeenCalled();
    expect(guarded.runtime.isTerminated).toBe(true);
    expect(guarded.runtime.getSnapshot().handoff.summary).toBeNull();
  });

  it("awaits an in-flight mutation before closing its repository", async () => {
    const repository = new DelayedAppendRepository();
    const guarded = harness({ repository });
    await guarded.runtime.initialize();

    const mutation = guarded.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    await repository.appendStarted;
    const disposal = guarded.runtime.dispose();
    expect(repository.closeCount).toBe(0);
    repository.release();

    await mutation;
    await disposal;
    expect(repository.closeCount).toBe(1);
    expect(repository.callsAfterClose).toBe(0);
  });

  it("gates pass opening and metrics after wipe, and disposes registration exactly once", async () => {
    let unregisterCount = 0;
    const guarded = harness({ onDispose: () => { unregisterCount += 1; } });
    await guarded.runtime.initialize();
    const firstDispose = guarded.runtime.dispose();
    expect(guarded.runtime.dispose()).toBe(firstDispose);
    await firstDispose;
    expect(unregisterCount).toBe(1);

    const afterWipe = harness();
    await afterWipe.runtime.initialize();
    await afterWipe.runtime.wipe("DELETE");
    const metricCount = afterWipe.metrics.entries.length;
    await expect(afterWipe.runtime.openPass("#handoff=invalid")).rejects.toThrow(/terminated/);
    expect(afterWipe.metrics.entries).toHaveLength(metricCount);

    const recreated = harness();
    await expect(recreated.runtime.initialize()).resolves.toBeUndefined();
  });

  it("stays terminated after partial deletion and blocks every persistent controller mutation", async () => {
    const partial = harness({ deleteAllData: async () => { throw new Error("cache deletion failed"); } });
    await partial.runtime.initialize();
    await partial.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(partial.runtime.exportBackupObject());
    expect(await partial.runtime.wipe("DELETE")).toBe(false);
    expect(partial.runtime.isTerminated).toBe(true);
    expect(partial.runtime.getSnapshot().today.recentEvents).toEqual([]);

    const importEvents = vi.spyOn(partial.repository, "import");
    const append = vi.spyOn(partial.repository, "append");
    const profileWrite = vi.spyOn(partial.profileStore, "write");
    const controllers = partial.runtime.getSnapshot();
    expect(controllers.handoff.summary).toBeNull();
    expect(() => controllers.privacy.onChooseImport({ name: "backup.json", text: backup })).toThrow(/terminated/);
    expect(() => controllers.capture.onSourceTextChange("wet diaper")).toThrow(/terminated/);
    expect(() => controllers.timeline.onFilterChange("feed")).toThrow(/terminated/);
    expect(() => controllers.onboarding.onNext()).toThrow(/terminated/);
    expect(() => controllers.handoff.onBoundaryChange("4")).toThrow(/terminated/);
    expect(() => controllers.privacy.onCancelImport()).toThrow(/terminated/);

    await expect(async () => { await controllers.privacy.onConfirmImport(); }).rejects.toThrow(/terminated/);
    await expect(partial.runtime.quickLog({ kind: "diaper", diaperKind: "wet" })).rejects.toThrow(/terminated/);
    await expect(async () => { await partial.runtime.getSnapshot().demo.onReset(); }).rejects.toThrow(/terminated/);
    await expect(async () => { await partial.runtime.getSnapshot().settings.onPreferenceChange("nursery", true); }).rejects.toThrow(/terminated/);
    expect(importEvents).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
    expect(profileWrite).not.toHaveBeenCalled();
  });

  it("waits for an in-flight adoption before globally wiping every realm", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), householdId: "wipe-adopted-household", babyId: "wipe-adopted-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const sharedStorage = new MemoryStorage();
    const sharedRepository = new DelayedAdoptRepository();
    const sharedLock = new SharedExclusiveIdentityLock();
    const demoProfile = new BrowserProfileStore("demo", sharedStorage, "America/Los_Angeles");
    demoProfile.write({ ...demoProfile.read(), nickname: "Must be cleared" });
    const deleteAllData = vi.fn(async () => { await sharedRepository.purgeAll("wipe-adopted-household"); });
    const adopter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    const wiper = harness({ repository: sharedRepository, identityLock: sharedLock, deleteAllData }, sharedStorage);
    await Promise.all([adopter.runtime.initialize(), wiper.runtime.initialize()]);
    await adopter.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: backup });

    const adoption = adopter.runtime.getSnapshot().privacy.onConfirmImport();
    await sharedRepository.adoptionStarted;
    const wipe = wiper.runtime.wipe("DELETE");
    await vi.waitFor(() => { expect(sharedLock.globalRequests).toBe(2); });
    expect(deleteAllData).not.toHaveBeenCalled();

    sharedRepository.release();
    await adoption;
    expect(adopter.runtime.getSnapshot().privacy.importState.status).toBe("success");
    await expect(wipe).resolves.toBe(true);
    expect(deleteAllData).toHaveBeenCalledOnce();
    expect(await sharedRepository.isEmpty()).toBe(true);
    expect(adopter.profileStore.read()).toMatchObject({ householdId: "real-household", babyId: "real-baby", nickname: "Baby" });
    expect(demoProfile.read()).toMatchObject({ householdId: "demo-household", babyId: "demo-baby", nickname: "Demo baby" });
  });

  it("fails a global wipe closed before mutation when browser locking is unavailable", async () => {
    const identityLock = new SharedExclusiveIdentityLock(false);
    const clearAllProfiles = vi.fn();
    const deleteAllData = vi.fn(async () => undefined);
    const target = harness({ identityLock, clearAllProfiles, deleteAllData });
    await target.runtime.initialize();
    const clearProfile = vi.spyOn(target.profileStore, "clear");
    const runGlobalExclusive = vi.spyOn(identityLock, "runGlobalExclusive");

    await expect(target.runtime.wipe("DELETE")).resolves.toBe(false);
    expect(target.runtime.isTerminated).toBe(false);
    expect(target.runtime.getSnapshot().privacy.wipePhase).toBe("error");
    expect(runGlobalExclusive).not.toHaveBeenCalled();
    expect(clearAllProfiles).not.toHaveBeenCalled();
    expect(clearProfile).not.toHaveBeenCalled();
    expect(deleteAllData).not.toHaveBeenCalled();

    await expect(target.runtime.quickLog({ kind: "diaper", diaperKind: "wet" })).resolves.toBeUndefined();
    expect(await target.repository.export("real-household")).toHaveLength(1);
  });

  it("restores mutation acceptance when an available global lock request fails before deletion", async () => {
    const runGlobalExclusive = vi.fn(async () => { throw new Error("simulated Web Locks request failure"); });
    const identityLock: IdentityMutationLock = {
      available: true,
      runExclusive: async (_realm, work) => work(),
      runGlobalExclusive,
    };
    const clearAllProfiles = vi.fn();
    const deleteAllData = vi.fn(async () => undefined);
    const target = harness({ identityLock, clearAllProfiles, deleteAllData });
    await target.runtime.initialize();
    const clearProfile = vi.spyOn(target.profileStore, "clear");

    await expect(target.runtime.wipe("DELETE")).resolves.toBe(false);
    expect(runGlobalExclusive).toHaveBeenCalledOnce();
    expect(target.runtime.isTerminated).toBe(false);
    expect(clearAllProfiles).not.toHaveBeenCalled();
    expect(clearProfile).not.toHaveBeenCalled();
    expect(deleteAllData).not.toHaveBeenCalled();

    await expect(target.runtime.quickLog({ kind: "diaper", diaperKind: "wet" })).resolves.toBeUndefined();
    expect(await target.repository.export("real-household")).toHaveLength(1);
  });

  it("rejects a cross-boundary backup with no events but allows same-boundary empty replacement", async () => {
    const foreign = harness();
    foreign.profileStore.write({ ...foreign.profileStore.read(), householdId: "foreign-household", babyId: "foreign-baby" });
    await foreign.runtime.initialize();
    const emptyForeignBackup = JSON.stringify(foreign.runtime.exportBackupObject());
    const target = harness();
    await target.runtime.initialize();
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "empty-foreign.json", text: emptyForeignBackup });
    const rejected = target.runtime.getSnapshot().privacy.importState;
    expect(rejected.status).toBe("error");
    if (rejected.status === "error") expect(rejected.reason).toMatch(/at least one care event/);
    expect(target.profileStore.read().householdId).toBe("real-household");
    expect(await target.repository.isEmpty()).toBe(true);

    const sameBoundary = harness();
    await sameBoundary.runtime.initialize();
    const settings = sameBoundary.runtime.getSnapshot().settings;
    await settings.onProfileSave({ ...settings.profile, nickname: "Empty backup" });
    const emptySameBoundaryBackup = JSON.stringify(sameBoundary.runtime.exportBackupObject());
    await target.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "empty-same.json", text: emptySameBoundaryBackup });
    expect(target.runtime.getSnapshot().privacy.importState.status).toBe("review");
    await target.runtime.getSnapshot().privacy.onConfirmImport();
    expect(target.runtime.getSnapshot().privacy.importState).toEqual({ status: "success", importedCount: 0 });
    expect(await target.repository.isEmpty()).toBe(true);
    expect(target.profileStore.read().nickname).toBe("Empty backup");
  });

  it("rejects cross-household restore over existing records without hiding either household", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), householdId: "foreign-household", babyId: "foreign-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const target = harness();
    await target.runtime.initialize();
    await target.runtime.quickLog({ kind: "bottle", volume: 2, unit: "oz" });
    const before = await target.repository.export("real-household");
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: backup });
    expect(target.runtime.getSnapshot().privacy.importState.status).toBe("error");
    expect(await target.repository.export("real-household")).toEqual(before);
    expect(await target.repository.export("foreign-household")).toEqual([]);
  });

  it("rejects a baby-only boundary change when existing records are present", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), babyId: "foreign-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const target = harness();
    await target.runtime.initialize();
    await target.runtime.quickLog({ kind: "bottle", volume: 2, unit: "oz" });
    const before = await target.repository.export("real-household");
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "other-baby.json", text: backup });
    expect(target.runtime.getSnapshot().privacy.importState.status).toBe("error");
    expect(await target.repository.export("real-household")).toEqual(before);
  });

  it("rejects boundary adoption into an empty but customized browser profile", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), householdId: "foreign-household", babyId: "foreign-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const target = harness();
    await target.runtime.initialize();
    const settings = target.runtime.getSnapshot().settings;
    await settings.onProfileSave({ ...settings.profile, nickname: "Customized" });
    expect(await target.repository.isEmpty()).toBe(true);
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: backup });
    const importState = target.runtime.getSnapshot().privacy.importState;
    expect(importState.status).toBe("error");
    if (importState.status === "error") expect(importState.reason).toMatch(/completely empty/);
    expect(target.profileStore.read().nickname).toBe("Customized");
  });

  it("rejects a reviewed proposal whose baby no longer matches the active profile", async () => {
    const target = harness();
    await target.runtime.initialize();
    await target.runtime.getSnapshot().capture.onSourceTextChange("wet diaper now");
    await target.runtime.getSnapshot().capture.onParse();
    const proposal = target.runtime.getSnapshot().capture.proposals[0];
    expect(proposal).toBeDefined();
    if (!proposal) return;
    target.runtime.getSnapshot().capture.onCorrect(proposal.clientId, "babyId", "different-baby");
    await target.runtime.getSnapshot().capture.onConfirm();
    expect(await target.repository.export("real-household")).toEqual([]);
    expect(target.runtime.getSnapshot().capture.stage).toBe("error");
  });

  it("clears typed but unparsed capture when the same runtime adopts a new identity", async () => {
    const foreignSource = harness();
    foreignSource.profileStore.write({ ...foreignSource.profileStore.read(), householdId: "typed-adopted-household", babyId: "typed-adopted-baby" });
    await foreignSource.runtime.initialize();
    await foreignSource.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const foreignBackup = JSON.stringify(foreignSource.runtime.exportBackupObject());

    const target = harness();
    await target.runtime.initialize();
    target.runtime.getSnapshot().capture.onSourceTextChange("wet diaper now");
    expect(target.runtime.getSnapshot().capture.sourceText).toBe("wet diaper now");
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: foreignBackup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();

    const capture = target.runtime.getSnapshot().capture;
    expect(capture.stage).toBe("error");
    expect(capture.sourceText).toBe("");
    expect(capture.speech.status).toBe("idle");
    if (capture.stage === "error") expect(capture.error.message).toMatch(/Start this care entry again/);
    expect(await target.repository.export("real-household")).toEqual([]);
    const committed = await target.repository.export("typed-adopted-household");
    expect(committed).toHaveLength(1);
    expect(committed[0]).toMatchObject({ householdId: "typed-adopted-household", babyId: "typed-adopted-baby" });
  });

  it("invalidates a reviewed proposal when the same runtime adopts a new identity", async () => {
    const foreignSource = harness();
    foreignSource.profileStore.write({ ...foreignSource.profileStore.read(), householdId: "adopted-household", babyId: "adopted-baby" });
    await foreignSource.runtime.initialize();
    await foreignSource.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const foreignBackup = JSON.stringify(foreignSource.runtime.exportBackupObject());

    const target = harness();
    await target.runtime.initialize();
    await target.runtime.getSnapshot().capture.onSourceTextChange("wet diaper now");
    await target.runtime.getSnapshot().capture.onParse();
    expect(target.runtime.getSnapshot().capture.proposals).toHaveLength(1);
    const appendBatch = vi.spyOn(target.repository, "appendBatch");
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: foreignBackup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();

    expect(target.runtime.getSnapshot().privacy.importState.status).toBe("success");
    expect(target.runtime.getSnapshot().capture.stage).toBe("error");
    expect(target.runtime.getSnapshot().capture.proposals).toEqual([]);
    if (target.runtime.getSnapshot().capture.stage === "error") expect(target.runtime.getSnapshot().capture.error?.message).toMatch(/active household or baby changed/);
    await target.runtime.getSnapshot().capture.onConfirm();
    expect(appendBatch).not.toHaveBeenCalled();
    expect(await target.repository.export("real-household")).toEqual([]);
    const committed = await target.repository.export("adopted-household");
    expect(committed).toHaveLength(1);
    expect(committed.every((event) => event.householdId === "adopted-household" && event.babyId === "adopted-baby")).toBe(true);
  });

  it("invalidates a reviewed stale-tab proposal when profile synchronization adopts the winner", async () => {
    const foreignSource = harness();
    foreignSource.profileStore.write({ ...foreignSource.profileStore.read(), householdId: "synced-household", babyId: "synced-baby" });
    await foreignSource.runtime.initialize();
    await foreignSource.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const foreignBackup = JSON.stringify(foreignSource.runtime.exportBackupObject());

    const sharedStorage = new MemoryStorage();
    const sharedRepository = new InMemoryEventRepository({ mode: "real" });
    const sharedLock = new SharedExclusiveIdentityLock();
    const adopter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    const staleWriter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    await Promise.all([adopter.runtime.initialize(), staleWriter.runtime.initialize()]);
    await staleWriter.runtime.getSnapshot().capture.onSourceTextChange("wet diaper now");
    await staleWriter.runtime.getSnapshot().capture.onParse();
    const staleSettings = staleWriter.runtime.getSnapshot().settings;
    const appendBatch = vi.spyOn(sharedRepository, "appendBatch");

    await adopter.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: foreignBackup });
    await adopter.runtime.getSnapshot().privacy.onConfirmImport();
    await staleSettings.onProfileSave({ ...staleSettings.profile, nickname: "Synced safely" });

    expect(staleWriter.runtime.exportBackupObject().profile).toMatchObject({ householdId: "synced-household", babyId: "synced-baby" });
    expect(staleWriter.runtime.getSnapshot().capture.stage).toBe("error");
    expect(staleWriter.runtime.getSnapshot().capture.proposals).toEqual([]);
    await staleWriter.runtime.getSnapshot().capture.onConfirm();
    expect(appendBatch).not.toHaveBeenCalled();
    expect(await sharedRepository.export("real-household")).toEqual([]);
    const committed = await sharedRepository.export("synced-household");
    expect(committed).toHaveLength(1);
    expect(committed.every((event) => event.householdId === "synced-household" && event.babyId === "synced-baby")).toBe(true);
  });

  it("rejects a stale care write, synchronizes the winning identity, and commits only on retry", async () => {
    const foreignSource = harness();
    foreignSource.profileStore.write({ ...foreignSource.profileStore.read(), householdId: "winning-household", babyId: "winning-baby" });
    await foreignSource.runtime.initialize();
    await foreignSource.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const foreignBackup = JSON.stringify(foreignSource.runtime.exportBackupObject());

    const sharedStorage = new MemoryStorage();
    const sharedRepository = new InMemoryEventRepository({ mode: "real" });
    const sharedLock = new SharedExclusiveIdentityLock();
    const adopter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    const staleWriter = harness({ repository: sharedRepository, identityLock: sharedLock, idFactory: () => "safe-retry-event" }, sharedStorage);
    await Promise.all([adopter.runtime.initialize(), staleWriter.runtime.initialize()]);
    await adopter.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: foreignBackup });
    await adopter.runtime.getSnapshot().privacy.onConfirmImport();
    expect(adopter.runtime.getSnapshot().privacy.importState.status).toBe("success");

    await staleWriter.runtime.quickLog({ kind: "solids", food: "banana" });
    expect(staleWriter.runtime.getSnapshot().settings.phase).toBe("error");
    expect(staleWriter.runtime.exportBackupObject().profile).toMatchObject({ householdId: "winning-household", babyId: "winning-baby" });
    expect(await sharedRepository.export("real-household")).toEqual([]);
    expect(await sharedRepository.export("winning-household")).toHaveLength(1);

    await staleWriter.runtime.quickLog({ kind: "solids", food: "banana" });
    expect(staleWriter.runtime.getSnapshot().settings.phase).toBe("success");
    const persisted = adopter.profileStore.read();
    const committed = await sharedRepository.export(persisted.householdId);
    expect(committed).toHaveLength(2);
    expect(committed.every((event) => event.householdId === persisted.householdId && event.babyId === persisted.babyId)).toBe(true);
  });

  it("synchronizes a stale runtime to persisted identity even when its event refresh fails", async () => {
    const foreignSource = harness();
    foreignSource.profileStore.write({ ...foreignSource.profileStore.read(), householdId: "durable-household", babyId: "durable-baby" });
    await foreignSource.runtime.initialize();
    await foreignSource.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const foreignBackup = JSON.stringify(foreignSource.runtime.exportBackupObject());

    const sharedStorage = new MemoryStorage();
    const sharedRepository = new ArmableListFailureRepository({ mode: "real" });
    const sharedLock = new SharedExclusiveIdentityLock();
    const adopter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    const staleWriter = harness({ repository: sharedRepository, identityLock: sharedLock, idFactory: () => "stale-safe-event" }, sharedStorage);
    await Promise.all([adopter.runtime.initialize(), staleWriter.runtime.initialize()]);
    const staleSettings = staleWriter.runtime.getSnapshot().settings;
    await adopter.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: foreignBackup });
    await adopter.runtime.getSnapshot().privacy.onConfirmImport();
    expect(adopter.runtime.getSnapshot().privacy.importState.status).toBe("success");

    const staleProfileWrite = vi.spyOn(staleWriter.profileStore, "write");
    sharedRepository.armListFailure();
    await staleSettings.onProfileSave({ ...staleSettings.profile, nickname: "Must not overwrite identity" });
    expect(staleWriter.runtime.getSnapshot().settings.phase).toBe("error");
    expect(staleProfileWrite).not.toHaveBeenCalled();
    expect(staleWriter.runtime.exportBackupObject().profile).toMatchObject({ householdId: "durable-household", babyId: "durable-baby" });
    expect(staleWriter.runtime.getSnapshot().today.recentEvents).toEqual([]);

    await staleWriter.runtime.quickLog({ kind: "solids", food: "banana" });
    const persisted = adopter.profileStore.read();
    const committed = await sharedRepository.export(persisted.householdId);
    expect(committed).toHaveLength(2);
    expect(committed.every((event) => event.householdId === persisted.householdId && event.babyId === persisted.babyId)).toBe(true);
  });

  it("preserves an adopted identity against stale settings and same-boundary import writers", async () => {
    const emptySource = harness();
    await emptySource.runtime.initialize();
    const emptySettings = emptySource.runtime.getSnapshot().settings;
    await emptySettings.onProfileSave({ ...emptySettings.profile, nickname: "Stale empty backup" });
    const staleSameBoundaryBackup = JSON.stringify(emptySource.runtime.exportBackupObject());

    const foreignSource = harness();
    foreignSource.profileStore.write({ ...foreignSource.profileStore.read(), householdId: "adopted-household", babyId: "adopted-baby" });
    await foreignSource.runtime.initialize();
    await foreignSource.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const foreignBackup = JSON.stringify(foreignSource.runtime.exportBackupObject());

    const sharedStorage = new MemoryStorage();
    const sharedRepository = new InMemoryEventRepository({ mode: "real" });
    const sharedLock = new SharedExclusiveIdentityLock();
    const adopter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    const staleWriter = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    await Promise.all([adopter.runtime.initialize(), staleWriter.runtime.initialize()]);
    const staleSettings = staleWriter.runtime.getSnapshot().settings;
    await staleWriter.runtime.getSnapshot().privacy.onChooseImport({ name: "stale-empty.json", text: staleSameBoundaryBackup });
    await adopter.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: foreignBackup });
    expect(staleWriter.runtime.getSnapshot().privacy.importState.status).toBe("review");
    expect(adopter.runtime.getSnapshot().privacy.importState.status).toBe("review");

    await adopter.runtime.getSnapshot().privacy.onConfirmImport();
    expect(adopter.runtime.getSnapshot().privacy.importState.status).toBe("success");
    const staleProfileWrite = vi.spyOn(staleWriter.profileStore, "write");
    await staleSettings.onProfileSave({ ...staleSettings.profile, nickname: "Safe stale edit" });
    expect(staleWriter.profileStore.read()).toMatchObject({ householdId: "adopted-household", babyId: "adopted-baby", nickname: "Safe stale edit" });

    const restore = vi.spyOn(sharedRepository, "restoreSnapshot");
    await staleWriter.runtime.getSnapshot().privacy.onConfirmImport();
    const staleImportState = staleWriter.runtime.getSnapshot().privacy.importState;
    expect(staleImportState.status).toBe("error");
    if (staleImportState.status === "error") expect(staleImportState.reason).toMatch(/identity changed after review/);
    expect(restore).not.toHaveBeenCalled();
    expect(staleProfileWrite).toHaveBeenCalledTimes(1);

    const persisted = adopter.profileStore.read();
    const committed = await sharedRepository.export(persisted.householdId);
    expect(persisted).toMatchObject({ householdId: "adopted-household", babyId: "adopted-baby" });
    expect(committed).toHaveLength(1);
    expect(committed.every((event) => event.householdId === persisted.householdId && event.babyId === persisted.babyId)).toBe(true);
    expect(staleWriter.runtime.exportBackupObject().profile).toMatchObject({ householdId: persisted.householdId, babyId: persisted.babyId });
  });

  it("allows exactly one concurrent cross-boundary adoption across runtimes sharing browser state", async () => {
    const sourceA = harness();
    sourceA.profileStore.write({ ...sourceA.profileStore.read(), householdId: "contender-household-a", babyId: "contender-baby-a" });
    await sourceA.runtime.initialize();
    await sourceA.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backupA = JSON.stringify(sourceA.runtime.exportBackupObject());

    const sourceB = harness();
    sourceB.profileStore.write({ ...sourceB.profileStore.read(), householdId: "contender-household-b", babyId: "contender-baby-b" });
    await sourceB.runtime.initialize();
    await sourceB.runtime.quickLog({ kind: "bottle", volume: 2, unit: "oz" });
    const backupB = JSON.stringify(sourceB.runtime.exportBackupObject());

    const sharedStorage = new MemoryStorage();
    const sharedRepository = new InMemoryEventRepository({ mode: "real" });
    const sharedLock = new SharedExclusiveIdentityLock();
    const tabA = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    const tabB = harness({ repository: sharedRepository, identityLock: sharedLock }, sharedStorage);
    await Promise.all([tabA.runtime.initialize(), tabB.runtime.initialize()]);
    await Promise.all([
      tabA.runtime.getSnapshot().privacy.onChooseImport({ name: "contender-a.json", text: backupA }),
      tabB.runtime.getSnapshot().privacy.onChooseImport({ name: "contender-b.json", text: backupB }),
    ]);
    expect(tabA.runtime.getSnapshot().privacy.importState.status).toBe("review");
    expect(tabB.runtime.getSnapshot().privacy.importState.status).toBe("review");

    const profileWrites = [vi.spyOn(tabA.profileStore, "write"), vi.spyOn(tabB.profileStore, "write")];
    await Promise.all([
      tabA.runtime.getSnapshot().privacy.onConfirmImport(),
      tabB.runtime.getSnapshot().privacy.onConfirmImport(),
    ]);

    const runtimes = [tabA.runtime, tabB.runtime];
    const states = runtimes.map((runtime) => runtime.getSnapshot().privacy.importState);
    const winners = states.flatMap((state, index) => state.status === "success" ? [index] : []);
    expect(winners).toHaveLength(1);
    const winner = winners[0] as number;
    const loser = winner === 0 ? 1 : 0;
    expect(states[loser]?.status).toBe("error");
    if (states[loser]?.status === "error") expect(states[loser].reason).toMatch(/identity changed after review/);
    expect(profileWrites[winner]).toHaveBeenCalledTimes(1);
    expect(profileWrites[loser]).not.toHaveBeenCalled();

    const persisted = tabA.profileStore.read();
    const committed = [
      ...await sharedRepository.export("contender-household-a"),
      ...await sharedRepository.export("contender-household-b"),
    ];
    expect(committed).toHaveLength(1);
    expect(committed.every((event) => event.householdId === persisted.householdId && event.babyId === persisted.babyId)).toBe(true);
    expect(runtimes[loser]?.exportBackupObject().profile.householdId).toBe(persisted.householdId);
    expect(runtimes[loser]?.exportBackupObject().profile.babyId).toBe(persisted.babyId);
  });

  it("fails closed when a cross-boundary import cannot obtain a trustworthy browser-wide lock", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), householdId: "foreign-household", babyId: "foreign-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const identityLock = new SharedExclusiveIdentityLock(false);
    const target = harness({ identityLock });
    await target.runtime.initialize();
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: backup });
    const runExclusive = vi.spyOn(identityLock, "runExclusive");
    const profileWrite = vi.spyOn(target.profileStore, "write");
    const adopt = vi.spyOn(target.repository, "adoptSnapshot");
    await target.runtime.getSnapshot().privacy.onConfirmImport();

    const state = target.runtime.getSnapshot().privacy.importState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.reason).toMatch(/browser-wide identity lock is unavailable/);
    expect(runExclusive).not.toHaveBeenCalled();
    expect(profileWrite).not.toHaveBeenCalled();
    expect(adopt).not.toHaveBeenCalled();
    expect(target.profileStore.read().householdId).toBe("real-household");
    expect(await target.repository.isEmpty()).toBe(true);
  });

  it("reports cross-boundary repository failure after restoring the previous empty profile", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), householdId: "foreign-household", babyId: "foreign-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());
    const repository = new FailingAdoptRepository({ mode: "real" });
    const target = harness({ repository });
    await target.runtime.initialize();
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: backup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();
    const state = target.runtime.getSnapshot().privacy.importState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.reason).toMatch(/previous empty profile was restored/);
    expect(target.profileStore.read().householdId).toBe("real-household");
    expect(await repository.isEmpty()).toBe(true);
  });

  it("surfaces explicit recovery when profile rollback fails after cross-boundary adoption failure", async () => {
    const source = harness();
    source.profileStore.write({ ...source.profileStore.read(), householdId: "foreign-household", babyId: "foreign-baby" });
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());
    const storage = new MemoryStorage();
    const profileStore = new FaultyProfileStore(storage, [2]);
    const repository = new FailingAdoptRepository({ mode: "real" });
    const target = harness({ repository, profileStore }, storage);
    await target.runtime.initialize();
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "foreign.json", text: backup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();
    const state = target.runtime.getSnapshot().privacy.importState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.reason).toMatch(/could not be rolled back/);
    expect(profileStore.read().householdId).toBe("foreign-household");
    expect(target.runtime.exportBackupObject().profile.householdId).toBe("foreign-household");
    expect(await repository.isEmpty()).toBe(true);
  });

  it("keeps profile settings untouched when the same-boundary repository transaction fails", async () => {
    const source = harness();
    await source.runtime.initialize();
    const settings = source.runtime.getSnapshot().settings;
    await settings.onProfileSave({ ...settings.profile, nickname: "Mina" });
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const repository = new FailingRestoreRepository({ mode: "real" });
    const target = harness({ repository });
    await target.runtime.initialize();
    await target.runtime.quickLog({ kind: "bottle", volume: 2, unit: "oz" });
    const before = await repository.export("real-household");
    const profileWrite = vi.spyOn(target.profileStore, "write");
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "same-household.json", text: backup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();
    const state = target.runtime.getSnapshot().privacy.importState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.reason).toMatch(/Profile settings were not changed/);
    expect(profileWrite).not.toHaveBeenCalled();
    expect(target.profileStore.read().nickname).toBe("Baby");
    expect(target.runtime.getSnapshot().settings.profile.nickname).toBe("Baby");
    expect(await repository.export("real-household")).toEqual(before);
  });

  it("keeps restored same-boundary records visible when profile activation fails", async () => {
    const source = harness();
    await source.runtime.initialize();
    const settings = source.runtime.getSnapshot().settings;
    await settings.onProfileSave({ ...settings.profile, nickname: "Mina" });
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());
    const storage = new MemoryStorage();
    const profileStore = new FaultyProfileStore(storage, [1]);
    const target = harness({ profileStore }, storage);
    await target.runtime.initialize();
    await target.runtime.quickLog({ kind: "bottle", volume: 2, unit: "oz" });
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "same-household.json", text: backup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();
    const state = target.runtime.getSnapshot().privacy.importState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.reason).toMatch(/Care records were restored/);
    expect(profileStore.read().nickname).toBe("Baby");
    expect((await target.repository.export("real-household")).map((event) => event.type)).toEqual(["diaper"]);
    expect(target.runtime.getSnapshot().today.recentEvents).toHaveLength(1);
  });

  it("restores a same-household event snapshot in one repository transaction", async () => {
    const source = harness();
    await source.runtime.initialize();
    await source.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    await source.runtime.quickLog({ kind: "bottle", volume: 3, unit: "oz" });
    const backup = JSON.stringify(source.runtime.exportBackupObject());

    const target = harness();
    await target.runtime.initialize();
    await target.runtime.quickLog({ kind: "solids", food: "banana" });
    await target.runtime.getSnapshot().privacy.onChooseImport({ name: "replace.json", text: backup });
    await target.runtime.getSnapshot().privacy.onConfirmImport();
    expect(target.runtime.getLastImportResult()).toEqual({ imported: 2, skipped: 0 });
    expect((await target.repository.export("real-household")).map((event) => event.id)).toEqual(["event-0001", "event-0002"]);
    expect(target.runtime.getSnapshot().privacy.importState.status).toBe("success");
  });

  it("anchors demo seeding to the injected clock and seeds only an empty repository", async () => {
    const demoClock = new MutableClock("2026-03-10T15:00:00.000Z");
    const demo = harness({ mode: "demo", clock: demoClock });
    await demo.runtime.initialize();
    const firstCount = (await demo.repository.list({ householdId: "demo-household" })).length;
    expect(firstCount).toBeGreaterThan(21);
    expect((await demo.repository.list({ householdId: "demo-household" })).every((event) => event.provenance === "demo")).toBe(true);
    await demo.runtime.initialize();
    expect((await demo.repository.list({ householdId: "demo-household" })).length).toBe(firstCount);
  });
});