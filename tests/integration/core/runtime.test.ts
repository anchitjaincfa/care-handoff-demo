import { describe, expect, it, vi } from "vitest";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import { addHours, addMinutes, wallClockForInstant } from "@/src/domain/time";
import { decodeHandoffFragment } from "@/src/domain/handoff";
import type { ClockPort } from "@/src/ports/ClockPort";
import type { MetricEntry, MetricsPort } from "@/src/ports/MetricsPort";
import type { SpeechCapability, SpeechPort } from "@/src/ports/SpeechPort";
import type { StoragePort, StorageStatus } from "@/src/ports/StoragePort";
import { BrowserProfileStore, createDefaultProfile } from "@/src/infrastructure/storage/BrowserProfileStore";
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
  const downloads: RuntimeDownload[] = [];
  let sequence = 0;
  const runtime = createExperienceRuntime({
    mode,
    repository,
    profileStore,
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
  return { runtime, repository, profileStore, clock, metrics, downloads, storage };
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
  });

  it("keeps incomplete proposals in review without partial writes", async () => {
    const { runtime, repository } = harness();
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("feed now; wet diaper now");
    await runtime.getSnapshot().capture.onParse();
    await runtime.getSnapshot().capture.onConfirm();
    expect(await repository.list({ householdId: "real-household" })).toEqual([]);
    expect(runtime.getSnapshot().capture.proposals.some((proposal) => proposal.unresolved.length > 0)).toBe(true);
    expect(runtime.getSnapshot().capture.stage).toBe("review");
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

  it("round-trips editable local capture times to UTC and preserves corrections through review recovery", async () => {
    const clock = new MutableClock("2026-07-28T07:30:00.000Z", "America/Los_Angeles");
    const { runtime, repository } = harness({ clock });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("Slept from 9:30 pm to 11 pm");
    await runtime.getSnapshot().capture.onParse();

    let proposal = runtime.getSnapshot().capture.proposals[0]!;
    expect(proposal.fields.find((field) => field.path === "startedAt")?.value).toBe("21:30");
    expect(proposal.fields.find((field) => field.path === "endedAt")?.value).toBe("23:00");

    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "startedAt", "20:15");
    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "endedAt", "22:45");
    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "fields.kind", "not-a-kind");
    await runtime.getSnapshot().capture.onConfirm();
    expect(runtime.getSnapshot().capture.stage).toBe("error");

    await runtime.getSnapshot().capture.onParse();
    proposal = runtime.getSnapshot().capture.proposals[0]!;
    expect(runtime.getSnapshot().capture.stage).toBe("review");
    expect(proposal.fields.find((field) => field.path === "startedAt")?.value).toBe("20:15");
    expect(proposal.fields.find((field) => field.path === "endedAt")?.value).toBe("22:45");

    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "fields.kind", "nap");
    await runtime.getSnapshot().capture.onConfirm();
    const saved = await repository.list({ householdId: "real-household" });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      startedAt: "2026-07-28T03:15:00.000Z",
      endedAt: "2026-07-28T05:45:00.000Z",
      fields: { kind: "nap" },
    });
  });

  it("rolls an edited open-interval end to the next local calendar day", async () => {
    const clock = new MutableClock("2026-07-28T14:00:00.000Z", "America/Los_Angeles");
    const { runtime, repository } = harness({ clock });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("Slept at 11 pm");
    await runtime.getSnapshot().capture.onParse();

    const proposal = runtime.getSnapshot().capture.proposals[0]!;
    expect(proposal.fields.find((field) => field.path === "startedAt")?.value).toBe("23:00");
    expect(proposal.fields.find((field) => field.path === "endedAt")?.value).toBeNull();
    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "endedAt", "01:00");
    const corrected = runtime.getSnapshot().capture.proposals[0]!;
    expect(corrected.unresolved).not.toContain("endedAt");
    expect(corrected.fields.find((field) => field.path === "endedAt")?.value).toBe("01:00");

    await runtime.getSnapshot().capture.onConfirm();
    expect((await repository.list({ householdId: "real-household" }))[0]).toMatchObject({
      startedAt: "2026-07-28T06:00:00.000Z",
      endedAt: "2026-07-28T08:00:00.000Z",
    });
  });

  it.each([
    ["spring-forward gap", "2026-03-08T12:00:00.000Z", "Slept at 1 am", "02:30"],
    ["fall-back fold", "2026-11-01T12:00:00.000Z", "Slept at 12:30 am", "01:30"],
  ] as const)("rejects an edited LA %s without writing", async (_case, now, source, editedEnd) => {
    const clock = new MutableClock(now, "America/Los_Angeles");
    const { runtime, repository } = harness({ clock });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange(source);
    await runtime.getSnapshot().capture.onParse();

    const proposal = runtime.getSnapshot().capture.proposals[0]!;
    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "endedAt", editedEnd);
    const corrected = runtime.getSnapshot().capture.proposals[0]!;
    expect(corrected.unresolved).toContain("endedAt");
    expect(corrected.fields.find((field) => field.path === "endedAt")?.value).toBeNull();
    expect(corrected.fields.find((field) => field.path === "endedAt")?.error).toBeTruthy();

    await runtime.getSnapshot().capture.onConfirm();
    expect(runtime.getSnapshot().capture.stage).toBe("review");
    expect(await repository.list({ householdId: "real-household" })).toEqual([]);
  });

  it("rejects a non-increasing edited interval before any repository write", async () => {
    const clock = new MutableClock("2026-07-28T07:30:00.000Z", "America/Los_Angeles");
    const { runtime, repository } = harness({ clock });
    await runtime.initialize();
    await runtime.getSnapshot().capture.onSourceTextChange("Slept from 9:30 pm to 11 pm");
    await runtime.getSnapshot().capture.onParse();
    const proposal = runtime.getSnapshot().capture.proposals[0]!;
    runtime.getSnapshot().capture.onCorrect(proposal.clientId, "startedAt", "23:00");

    await runtime.getSnapshot().capture.onConfirm();
    expect(runtime.getSnapshot().capture.stage).toBe("error");
    expect(await repository.list({ householdId: "real-household" })).toEqual([]);
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
    restored.runtime.getSnapshot().privacy.onChooseImport({ name: "backup.json", text: text ?? "" });
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

  it("reports both imported and skipped backup counts honestly", async () => {
    const duplicate = harness();
    await duplicate.runtime.initialize();
    await duplicate.runtime.quickLog({ kind: "diaper", diaperKind: "wet" });
    await duplicate.runtime.getSnapshot().privacy.onExport("json");
    const text = await duplicate.downloads[0]?.data.text();
    duplicate.runtime.getSnapshot().privacy.onChooseImport({ name: "same.json", text: text ?? "" });
    await duplicate.runtime.getSnapshot().privacy.onConfirmImport();
    expect(duplicate.runtime.getLastImportResult()).toEqual({ imported: 0, skipped: 1 });
    const state = duplicate.runtime.getSnapshot().privacy.importState;
    expect(state.status).toBe("error");
    if (state.status === "error") expect(state.reason).toContain("skipped 1");
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