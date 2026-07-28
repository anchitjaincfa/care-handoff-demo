import { describe, expect, it } from "vitest";
import { InMemoryEventRepository } from "@/src/adapters/InMemoryEventRepository";
import { CareEventSchema, type CareEvent } from "@/src/domain/types";
import { addHours, addMinutes, wallClockForInstant } from "@/src/domain/time";
import type { ClockPort } from "@/src/ports/ClockPort";
import type { MetricEntry, MetricsPort } from "@/src/ports/MetricsPort";
import type { SpeechCapability, SpeechPort } from "@/src/ports/SpeechPort";
import type { StoragePort, StorageStatus } from "@/src/ports/StoragePort";
import { BrowserProfileStore, createDefaultProfile } from "@/src/infrastructure/storage/BrowserProfileStore";
import { SpeechAccessError } from "@/src/infrastructure/speech/BrowserSpeechPort";
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
  capabilityValue: SpeechCapability = { available: false, locality: "unavailable", language: "en-US", reason: "Unavailable in test" };
  private errorListener: ((error: SpeechAccessError) => void) | null = null;
  async capability(language: string): Promise<SpeechCapability> { return { ...this.capabilityValue, language }; }
  async start(language: string, onFinal: (text: string) => void, onInterim?: (text: string) => void): Promise<void> { void language; void onFinal; void onInterim; }
  setErrorListener(listener: (error: SpeechAccessError) => void): () => void { this.errorListener = listener; return () => { this.errorListener = null; }; }
  emitError(error = new SpeechAccessError("failed", "mid-session failure")): void { this.errorListener?.(error); }
  stop(): void {}
  cancel(): void {}
}

class FakeStorage implements StoragePort {
  persisted = false;
  async requestPersistence(): Promise<boolean> { this.persisted = true; return true; }
  async status(): Promise<StorageStatus> { return { persisted: this.persisted }; }
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

describe("experience runtime capture and persistence", () => {
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

  it("requires real solids details and surfaces mid-session speech errors", async () => {
    const speech = new FakeSpeech();
    speech.capabilityValue = { available: true, locality: "browser-service", language: "en-US" };
    const withoutDetails = harness({ speech });
    await withoutDetails.runtime.initialize();
    await withoutDetails.runtime.quickLog("solids");
    expect(await withoutDetails.repository.list({ householdId: "real-household" })).toEqual([]);
    expect(withoutDetails.runtime.getSnapshot().today.phase).toBe("error");

    await withoutDetails.runtime.getSnapshot().capture.onProbeSpeech();
    await withoutDetails.runtime.getSnapshot().capture.onAcceptSpeechDisclosure();
    expect(withoutDetails.runtime.getSnapshot().capture.stage).toBe("listening");
    speech.emitError();
    expect(withoutDetails.runtime.getSnapshot().capture.stage).toBe("error");
    expect(withoutDetails.runtime.getSnapshot().capture.speech.status).toBe("error");

    const withDetails = harness({ requestQuickLogDetails: () => ({ food: "banana" }) });
    await withDetails.runtime.initialize();
    await withDetails.runtime.quickLog("solids");
    expect(withDetails.runtime.getSnapshot().today.recentEvents[0]?.detail).toBe("banana");
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
    await runtime.quickLog("diaper");
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
    await atTwenty.repository.import("real-household", samples.slice(20));
    const atTwentyOne = harness({ repository: atTwenty.repository, profileStore: atTwenty.profileStore, clock: atTwenty.clock }, atTwenty.storage);
    await atTwentyOne.runtime.initialize();
    expect(atTwentyOne.runtime.getSnapshot().insights.routine.status).toBe("ready");
    expect(atTwentyOne.runtime.getSnapshot().insights.nextEvent.status).toBe("ready");
  });

  it("withholds stale predictions even with 21 samples", async () => {
    const stale = harness();
    const events = Array.from({ length: 21 }, (_, index) => completedFeed(index, addHours(stale.clock.instant, -(24 * 40) + index)));
    await stale.repository.import("real-household", events);
    await stale.runtime.initialize();
    expect(stale.runtime.getSnapshot().insights.routine.status).toBe("forming");
    expect(stale.runtime.getSnapshot().insights.nextEvent.status).toBe("forming");
  });
});

describe("handoff and backup lifecycle", () => {
  it("preflights a full URL, decodes it, and reports expiry from the injected clock", async () => {
    const source = harness();
    await source.runtime.initialize();
    await source.runtime.quickLog("diaper");
    await source.runtime.getSnapshot().handoff.onGenerate("url");
    const artifact = source.runtime.getSnapshot().handoff.artifact;
    expect(artifact.status).toBe("ready");
    if (artifact.status !== "ready") return;
    expect(artifact.byteCount).toBeGreaterThan(new TextEncoder().encode(artifact.fragment).byteLength);

    const viewer = harness();
    await viewer.runtime.initialize();
    expect((await viewer.runtime.openPass(artifact.fragment)).status).toBe("valid");
    viewer.clock.instant = addHours(viewer.clock.instant, 25);
    expect((await viewer.runtime.openPass(artifact.fragment)).status).toBe("expired");
  });

  it("exports profile and events, requires exact DELETE, wipes, and restores into an empty runtime", async () => {
    const original = harness();
    await original.runtime.initialize();
    const settings = original.runtime.getSnapshot().settings;
    await settings.onProfileSave({ ...settings.profile, nickname: "Mina" });
    await original.runtime.quickLog("diaper");
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

  it("gates pass opening and metrics after wipe, and disposes registration exactly once", async () => {
    let unregisterCount = 0;
    const guarded = harness({ onDispose: () => { unregisterCount += 1; } });
    await guarded.runtime.initialize();
    await guarded.runtime.dispose();
    await guarded.runtime.dispose();
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

  it("reports both imported and skipped backup counts honestly", async () => {
    const duplicate = harness();
    await duplicate.runtime.initialize();
    await duplicate.runtime.quickLog("diaper");
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