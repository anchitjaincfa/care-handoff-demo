import QRCode from "qrcode";
import { CareEventSchema, type CareEvent, type ProposedEvent } from "@/src/domain/types";
import { parseCareEvents } from "@/src/domain/parser";
import { addMinutes } from "@/src/domain/time";
import { createDemoSeed } from "@/src/domain/demoSeed";
import { createCsvProvenanceZip } from "@/src/domain/exports";
import {
  HANDOFF_ARTIFACT_BOUNDS,
  decodeHandoffFragment,
  encodeHandoffFragment,
  generateHandoffPayload,
  isHandoffExpired,
  summarizeHandoffPayload,
  type CurrentHandoffPayload,
  type HandoffTransport,
} from "@/src/domain/handoff";
import type { EventQuery, EventRepository } from "@/src/ports/EventRepository";
import { DataGenerationMismatchError, type DataGenerationStore } from "@/src/ports/DataGenerationStore";
import type { IdentityMutationLock } from "@/src/ports/IdentityMutationLock";
import type { ClockPort } from "@/src/ports/ClockPort";
import type { MetricsPort, MetricName } from "@/src/ports/MetricsPort";
import type { SpeechPort } from "@/src/ports/SpeechPort";
import type { StoragePort } from "@/src/ports/StoragePort";
import type {
  ActionPhase,
  CaptureErrorViewModel,
  CapturePageProps,
  EventEditDraft,
  EventRowViewModel,
  ExperienceControllerSet,
  HandoffArtifactState,
  ImportCandidate,
  ImportState,
  ManualQuickLogDraft,
  OnboardingDraft,
  PassViewerState,
  PrivacyPageProps,
  ProposalViewModel,
  RefusalViewModel,
  ReviewFieldViewModel,
  SpeechUIState,
  StoragePersistenceState,
  TimelinePageProps,
} from "@/src/features/runtime/contracts";
import {
  BrowserProfileSchema,
  createDefaultProfile,
  type BrowserProfile,
  type ProfileStore,
} from "@/src/infrastructure/storage/BrowserProfileStore";
import type { DataRealm } from "@/src/infrastructure/storage/names";
import { SpeechAccessError } from "@/src/infrastructure/speech/BrowserSpeechPort";
import { createRuntimeBackup, parseRuntimeBackup, stringifyRuntimeBackup, type RuntimeBackup } from "./backup";
import { buildInsightsView, formatDate, formatTime, timelineGroups, toEditDraft, toEventRow } from "./viewModels";

export type RuntimeDownload = { name: string; type: string; data: Blob };
export type TimerStartOutcome = { status: "started"; id: string } | { status: "overlap"; activeId: string } | { status: "error" };
export type RuntimeImportResult = { imported: number; skipped: number };

export type ExperienceRuntimeDependencies = {
  mode: DataRealm;
  repository: EventRepository;
  profileStore: ProfileStore;
  dataGenerationStore: DataGenerationStore;
  identityLock: IdentityMutationLock;
  clock: ClockPort;
  speech: SpeechPort;
  storage: StoragePort;
  metrics: MetricsPort;
  origin?: string;
  passFragment?: string;
  idFactory?: () => string;
  download?: (download: RuntimeDownload) => void | Promise<void>;
  copyText?: (value: string) => void | Promise<void>;
  deleteAllData?: () => Promise<unknown>;
  clearAllProfiles?: () => void;
  onDispose?: () => void | Promise<void>;
};

type EditableProposal = { value: ProposedEvent; edited: boolean };
type UndoAction = () => Promise<void>;
type CaptureStage = CapturePageProps["stage"];

function safeReason(): string { return "That action could not be completed. Your existing records were left unchanged."; }
function captureError(message = safeReason()): CaptureErrorViewModel { return { title: "Unable to continue", message, recovery: "retry" }; }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

export function handoffTransportsFor(payload: CurrentHandoffPayload, origin: string): { fragment: string; url: string; byteCount: number; qr: boolean; urlTransport: boolean } {
  const fragment = encodeHandoffFragment(payload, "url");
  const url = `${origin.replace(/\/$/, "")}/pass/${fragment}`;
  const byteCount = utf8Bytes(url);
  return { fragment, url, byteCount, qr: byteCount <= HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes, urlTransport: byteCount <= HANDOFF_ARTIFACT_BOUNDS.urlFragmentBytes };
}
function extensionTimestamp(instant: string): string { return instant.replace(/[:.]/g, "-"); }
function clone<T>(value: T): T { return structuredClone(value); }
function isPresent(value: unknown): boolean { return value !== null && value !== undefined && value !== ""; }
function isPositive(value: number | null): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }

function defaultId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function optionSet(path: string): ReviewFieldViewModel["options"] {
  if (path === "fields.mode") return [{ label: "Nursing", value: "nursing" }, { label: "Bottle", value: "bottle" }];
  if (path === "fields.side") return [{ label: "Left", value: "left" }, { label: "Right", value: "right" }, { label: "Both", value: "both" }];
  if (path === "fields.unit") return [{ label: "oz", value: "oz" }, { label: "ml", value: "ml" }];
  if (path === "fields.contents") return [{ label: "Breastmilk", value: "breastmilk" }, { label: "Formula", value: "formula" }, { label: "Mixed", value: "mixed" }];
  if (path === "fields.kind") return [{ label: "Wet", value: "wet" }, { label: "Dirty", value: "dirty" }, { label: "Both", value: "both" }, { label: "Dry", value: "dry" }];
  return undefined;
}

function fieldControl(path: string, value: unknown): ReviewFieldViewModel["control"] {
  if (path === "startedAt" || path === "endedAt") return "time";
  if (optionSet(path)) return "select";
  return typeof value === "number" ? "number" : "text";
}

function fieldLabel(path: string): string {
  return path.replace(/^fields\./, "").replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function passEventRows(payload: CurrentHandoffPayload, locale: { locale: string; timeZone: string }): EventRowViewModel[] {
  return payload.events.map((event, index) => {
    let title = "Diaper";
    let detail = event.type === "diaper" ? `${event.details.kind[0]?.toUpperCase()}${event.details.kind.slice(1)}` : "";
    if (event.type === "feed") {
      title = event.details.mode === "bottle" ? "Bottle feed" : "Nursing";
      detail = event.details.volume && event.details.unit ? `${event.details.volume} ${event.details.unit}` : "Logged feed";
    } else if (event.type === "sleep") {
      title = "Sleep";
      detail = event.endedAt ? `${Math.max(0, Math.round((Date.parse(event.endedAt) - Date.parse(event.at)) / 60_000))} min` : "Timer running";
    }
    return { id: `handoff-${index}`, type: event.type, timeLabel: formatTime(event.at, locale), title, detail, canEdit: false, canDelete: false };
  });
}

function proposalView(editable: EditableProposal): ProposalViewModel {
  const proposal = editable.value;
  const values: Array<[string, string | number | null]> = [
    ["startedAt", proposal.startedAt],
    ...Object.entries(proposal.fields).flatMap(([key, value]) => typeof value === "string" || typeof value === "number" || value === null ? [[`fields.${key}`, value] as [string, string | number | null]] : []),
  ];
  if (proposal.endedAt !== undefined) values.splice(1, 0, ["endedAt", proposal.endedAt ?? null]);
  for (const unresolved of proposal.unresolved) if (!values.some(([path]) => path === unresolved)) values.push([unresolved, null]);
  const fields = values.map(([path, value]): ReviewFieldViewModel => ({
    path,
    label: fieldLabel(path),
    value,
    control: fieldControl(path, value),
    ...(optionSet(path) ? { options: optionSet(path) } : {}),
    confidence: proposal.fieldConfidence[path] ?? proposal.confidence,
    ...(proposal.assumptions[0] ? { assumption: proposal.assumptions[0] } : {}),
    ...(proposal.unresolved.includes(path) ? { error: "Review this field before saving." } : {}),
  }));
  return {
    clientId: proposal.clientId,
    type: proposal.type,
    title: proposal.type === "feed" ? "Feed" : proposal.type === "sleep" ? "Sleep" : "Diaper",
    confidence: proposal.confidence,
    unresolved: proposal.unresolved,
    fields,
  };
}

function editableEvent(input: ProposedEvent, profile: BrowserProfile, now: string, id: string, captureMethod: "typed" | "voice", clock: ClockPort, mode: DataRealm): CareEvent {
  if (!input.babyId || !input.startedAt || input.unresolved.length) throw new Error("Proposal is incomplete");
  if (input.babyId !== profile.babyId) throw new Error("Proposal baby identity no longer matches the active profile");
  const candidate = {
    id,
    householdId: profile.householdId,
    babyId: input.babyId,
    type: input.type,
    startedAt: input.startedAt,
    ...(input.endedAt === undefined ? {} : { endedAt: input.endedAt }),
    timeZone: input.timeZone,
    enteredWallClock: clock.wallClock(input.startedAt, input.timeZone),
    fields: input.fields,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: 1,
    captureMethod,
    provenance: mode,
  };
  return CareEventSchema.parse(candidate);
}

export class ExperienceRuntime {
  private profile: BrowserProfile;
  private dataGeneration: string;
  private events: CareEvent[] = [];
  private listeners = new Set<() => void>();
  private initialized = false;
  private terminated = false;
  private acceptingMutations = true;
  private disposing = false;
  private initializationPromise: Promise<void> | null = null;
  private disposalPromise: Promise<void> | null = null;
  private mutationTail: Promise<void> = Promise.resolve();
  private undoAction: UndoAction | null = null;
  private actionPhase: ActionPhase = "idle";
  private onboardingPhase: ActionPhase = "idle";
  private onboardingStep: 1 | 2 | 3 = 1;
  private onboardingDraft: OnboardingDraft;
  private captureStage: CaptureStage = "idle";
  private captureError: CaptureErrorViewModel | null = null;
  private captureSource = "";
  private captureOrigin: "typed" | "voice" = "typed";
  private proposals: EditableProposal[] = [];
  private refusals: RefusalViewModel[] = [];
  private speechState: SpeechUIState = { status: "idle" };
  private timelineFilter: TimelinePageProps["filter"] = "all";
  private editing: EventEditDraft | null = null;
  private deletingId: string | null = null;
  private handoffBoundary = "8";
  private handoffArtifact: HandoffArtifactState = { status: "idle" };
  private handoffUrl: string | null = null;
  private passState: PassViewerState = { status: "empty" };
  private persistence: StoragePersistenceState = "idle";
  private storageEstimate: PrivacyPageProps["storageEstimate"] = {};
  private exportPhase: ActionPhase = "idle";
  private importState: ImportState = { status: "idle" };
  private importCandidate: RuntimeBackup | null = null;
  private importBaselineIdentity: Pick<BrowserProfile, "householdId" | "babyId"> | null = null;
  private wipePhase: ActionPhase = "idle";
  private resetPhase: ActionPhase = "idle";
  private lastImportResult: RuntimeImportResult | null = null;
  private speechErrorUnsubscribe: (() => void) | null = null;
  private dataGenerationUnsubscribe: (() => void) | null = null;
  private disposed = false;
  private handoffPreviewCache: { key: string; payload: CurrentHandoffPayload } | null = null;

  constructor(private readonly dependencies: ExperienceRuntimeDependencies) {
    if (dependencies.profileStore.realm !== dependencies.mode) throw new Error("Profile store realm does not match runtime mode");
    this.dataGeneration = dependencies.dataGenerationStore.read();
    this.profile = dependencies.profileStore.read();
    this.onboardingDraft = this.draftFromProfile(this.profile);
    const observableSpeech = dependencies.speech as SpeechPort & { setErrorListener?: (listener: (error: SpeechAccessError) => void) => () => void };
    this.speechErrorUnsubscribe = observableSpeech.setErrorListener?.((error) => this.handleSpeechRuntimeError(error)) ?? null;
    this.dataGenerationUnsubscribe = dependencies.dataGenerationStore.subscribe?.((generation) => {
      if (generation === null || generation !== this.dataGeneration) this.invalidateForStaleDataGeneration();
    }) ?? null;
  }

  get mode(): DataRealm { return this.dependencies.mode; }
  get isInitialized(): boolean { return this.initialized; }
  get isTerminated(): boolean { return this.terminated; }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private notify(): void { for (const listener of this.listeners) listener(); }
  private locale() { return { locale: this.profile.locale, timeZone: this.profile.timeZone }; }
  private availableTimeZones(): readonly string[] {
    let supported: string[];
    try { supported = Intl.supportedValuesOf("timeZone"); } catch { supported = ["UTC"]; }
    return [...new Set([this.profile.timeZone, ...supported])];
  }
  private activeEvents(): CareEvent[] { return this.events.filter((event) => event.deletedAt === null); }
  private openTimers(): CareEvent[] { return this.activeEvents().filter((event) => (event.type === "feed" || event.type === "sleep") && event.endedAt === null); }
  // These raw helpers are called only while the data-generation fence is held.
  // Keeping them separate from coordinated entry helpers avoids re-entering the
  // non-reentrant browser Web Locks used by care and identity transactions.
  private async recordMetricWithinIdentityMutation(name: MetricName, durationMs?: number): Promise<void> {
    try { await this.dependencies.metrics.record({ name, at: this.dependencies.clock.now(), ...(durationMs === undefined ? {} : { durationMs }) }); } catch { /* Metrics never block care actions. */ }
  }

  private async metric(name: MetricName, durationMs?: number): Promise<void> {
    if (this.terminated || this.disposing || this.disposed) return;
    try { await this.coordinateIdentityMutation(() => this.recordMetricWithinIdentityMutation(name, durationMs)); }
    catch (error) {
      if (error instanceof DataGenerationMismatchError) throw error;
      // Lock or metrics failures are non-blocking; no durable write was authorized.
    }
  }

  private async exportMetrics(): Promise<string> {
    return this.coordinateIdentityMutation(() => this.dependencies.metrics.exportJson());
  }
  private handleSpeechRuntimeError(error: SpeechAccessError): void {
    if (this.terminated || this.disposing || this.disposed) return;
    this.captureStage = "error";
    this.speechState = error.code === "denied"
      ? { status: "denied", reason: "Microphone permission was denied. Typed capture is still available." }
      : { status: "error", reason: "Speech recognition stopped unexpectedly." };
    this.captureError = captureError(error.code === "denied" ? "Microphone permission was denied. You can type the entry instead." : "Speech recognition stopped. Your transcript was not saved; review it or type the entry.");
    this.notify();
  }

  private draftFromProfile(profile: BrowserProfile): OnboardingDraft {
    return { babyLabel: profile.nickname, timeZone: profile.timeZone, locale: profile.locale, volumeUnit: profile.volumeUnit, tracked: profile.tracked };
  }
  private ensureRuntimeUsable(): void {
    if (this.terminated) throw new Error("Runtime was terminated after local data deletion");
    if (this.disposing || this.disposed) throw new Error("Runtime is no longer active");
  }

  private ensureActive(): void {
    this.ensureRuntimeUsable();
    if (!this.acceptingMutations) throw new Error("Runtime is no longer active");
  }

  private mutateState<T>(work: () => T): T {
    this.ensureActive();
    return work();
  }

  private enqueueMutation<T>(work: () => Promise<T>, terminal = false): Promise<T> {
    this.ensureActive();
    if (terminal) this.acceptingMutations = false;
    const operation = this.mutationTail.then(work);
    this.mutationTail = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private invalidateHandoffReview(): void {
    this.handoffPreviewCache = null;
    this.handoffArtifact = { status: "idle" };
    this.handoffUrl = null;
  }

  private async listEventsWithinIdentityMutation(query: EventQuery): Promise<CareEvent[]> {
    return this.dependencies.repository.list(query);
  }

  private async listEvents(query: EventQuery): Promise<CareEvent[]> {
    return this.coordinateIdentityMutation(() => this.listEventsWithinIdentityMutation(query));
  }

  private async repositoryIsEmptyWithinIdentityMutation(): Promise<boolean> {
    return this.dependencies.repository.isEmpty();
  }

  private async repositoryIsEmpty(): Promise<boolean> {
    return this.coordinateIdentityMutation(() => this.repositoryIsEmptyWithinIdentityMutation());
  }

  private async exportEvents(householdId: string): Promise<CareEvent[]> {
    return this.coordinateIdentityMutation(() => this.dependencies.repository.export(householdId));
  }

  private async refreshEventsWithinIdentityMutation(): Promise<void> {
    this.events = await this.listEventsWithinIdentityMutation({ householdId: this.profile.householdId, includeDeleted: true });
    this.invalidateHandoffReview();
  }

  private async refreshEvents(): Promise<void> {
    await this.coordinateIdentityMutation(() => this.refreshEventsWithinIdentityMutation());
  }

  private rememberCommittedEvents(events: CareEvent[]): void {
    const committedIds = new Set(events.map((event) => event.id));
    this.events = [...this.events.filter((event) => !committedIds.has(event.id)), ...events.map(clone)]
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
    this.invalidateHandoffReview();
  }

  private async refreshAfterCommitWithinIdentityMutation(events: CareEvent[]): Promise<void> {
    try { await this.refreshEventsWithinIdentityMutation(); }
    catch { this.rememberCommittedEvents(events); }
  }

  private async refreshStorageStatus(): Promise<void> {
    try {
      const status = await this.dependencies.storage.status();
      this.persistence = status.persisted ? "granted" : "idle";
      this.storageEstimate = {
        ...(typeof status.usage === "number" ? { usageBytes: status.usage } : {}),
        ...(typeof status.quota === "number" ? { quotaBytes: status.quota } : {}),
      };
    } catch {
      this.persistence = "unavailable";
      this.storageEstimate = {};
    }
  }

  initialize(): Promise<void> {
    if (this.initializationPromise) return this.initializationPromise;
    this.ensureActive();
    const operation = this.initializeOnce();
    this.initializationPromise = operation;
    void operation.catch(() => {
      if (this.acceptingMutations && !this.terminated && !this.disposing && !this.disposed) this.initializationPromise = null;
    });
    return operation;
  }

  private async initializeOnce(): Promise<void> {
    this.synchronizeRuntimeProfile(this.dependencies.profileStore.read());
    const existing = await this.listEvents({ householdId: this.profile.householdId, includeDeleted: true });
    this.ensureRuntimeUsable();
    if (this.mode === "demo" && existing.length === 0) {
      await this.coordinateCareMutation(async () => {
        if (!await this.repositoryIsEmptyWithinIdentityMutation()) return;
        const seed = createDemoSeed({ householdId: this.profile.householdId, babyId: this.profile.babyId, timeZone: this.profile.timeZone, anchorInstant: this.dependencies.clock.now() });
        await this.dependencies.repository.import(this.profile.householdId, seed);
      });
      this.ensureRuntimeUsable();
    }
    await this.refreshEvents();
    this.ensureRuntimeUsable();
    await this.refreshStorageStatus();
    this.ensureRuntimeUsable();
    if (this.dependencies.passFragment) {
      await this.openPass(this.dependencies.passFragment);
      this.ensureRuntimeUsable();
    }
    this.initialized = true;
    this.notify();
  }

  private async setAction(work: () => Promise<void>): Promise<void> {
    await this.enqueueMutation(async () => {
      this.actionPhase = "pending";
      this.notify();
      try { await work(); this.actionPhase = "success"; }
      catch { this.actionPhase = "error"; }
      this.notify();
    });
  }

  private manualEvent(draft: ManualQuickLogDraft, at: string): CareEvent {
    const durationMinutes = draft.kind === "pumping" || draft.kind === "tummy-time" ? draft.durationMinutes : null;
    const startedAt = isPositive(durationMinutes) ? addMinutes(at, -durationMinutes) : at;
    const base = {
      id: this.dependencies.idFactory?.() ?? defaultId(),
      householdId: this.profile.householdId,
      babyId: this.profile.babyId,
      startedAt,
      timeZone: this.profile.timeZone,
      enteredWallClock: this.dependencies.clock.wallClock(startedAt, this.profile.timeZone),
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      schemaVersion: 1,
      captureMethod: "manual",
      provenance: this.mode,
    } as const;
    if (draft.kind === "bottle") {
      if (!isPositive(draft.volume)) throw new Error("Bottle quick log requires a positive volume");
      return CareEventSchema.parse({ ...base, type: "feed", endedAt: at, fields: { mode: "bottle", volume: draft.volume, unit: draft.unit } });
    }
    if (draft.kind === "diaper") {
      if (!draft.diaperKind) throw new Error("Diaper quick log requires a kind");
      return CareEventSchema.parse({ ...base, type: "diaper", fields: { kind: draft.diaperKind } });
    }
    if (draft.kind === "pumping") {
      if (!isPositive(draft.durationMinutes) || !isPositive(draft.volume)) throw new Error("Pumping quick log requires duration and volume");
      return CareEventSchema.parse({ ...base, type: "pumping", endedAt: at, fields: { durationMinutes: draft.durationMinutes, volume: draft.volume, unit: draft.unit } });
    }
    if (draft.kind === "solids") {
      const food = draft.food.trim();
      if (!food) throw new Error("Solids quick log requires a food description");
      return CareEventSchema.parse({ ...base, type: "solids", fields: { food } });
    }
    if (!isPositive(draft.durationMinutes)) throw new Error("Tummy-time quick log requires a duration");
    return CareEventSchema.parse({ ...base, type: "tummy-time", endedAt: at, fields: { durationMinutes: draft.durationMinutes } });
  }

  async quickLog(draft: ManualQuickLogDraft): Promise<void> {
    await this.setAction(async () => {
      await this.coordinateCareMutation(async () => {
        const event = this.manualEvent(draft, this.dependencies.clock.now());
        await this.dependencies.repository.append(event);
        this.undoAction = async () => { await this.dependencies.repository.softDelete(event.householdId, event.id, this.dependencies.clock.now()); };
        await this.refreshAfterCommitWithinIdentityMutation([event]);
        await this.recordMetricWithinIdentityMutation("capture_manual");
      });
    });
  }

  async startTimer(type: "feed" | "sleep"): Promise<TimerStartOutcome> {
    this.ensureActive();
    let outcome: TimerStartOutcome = { status: "error" };
    await this.setAction(async () => {
      await this.coordinateCareMutation(async () => {
        const active = this.openTimers()[0];
        if (active) {
          outcome = { status: "overlap", activeId: active.id };
          throw new Error("A care timer is already active");
        }
        const now = this.dependencies.clock.now();
        const base = {
          id: this.dependencies.idFactory?.() ?? defaultId(), householdId: this.profile.householdId, babyId: this.profile.babyId,
          type, startedAt: now, endedAt: null, timeZone: this.profile.timeZone,
          enteredWallClock: this.dependencies.clock.wallClock(now, this.profile.timeZone), createdAt: now, updatedAt: now,
          deletedAt: null, schemaVersion: 1, captureMethod: "manual", provenance: this.mode,
        } as const;
        const event = CareEventSchema.parse(type === "feed" ? { ...base, fields: { mode: "nursing" } } : { ...base, fields: { kind: "unspecified" } });
        await this.dependencies.repository.append(event);
        this.undoAction = async () => { await this.dependencies.repository.softDelete(event.householdId, event.id, this.dependencies.clock.now()); };
        await this.refreshAfterCommitWithinIdentityMutation([event]);
        await this.recordMetricWithinIdentityMutation("capture_manual");
        outcome = { status: "started", id: event.id };
      });
    });
    return outcome;
  }

  async stopTimer(id: string): Promise<void> {
    await this.setAction(async () => {
      await this.coordinateCareMutation(async () => {
        const event = await this.dependencies.repository.get(this.profile.householdId, id);
        if (!event || (event.type !== "feed" && event.type !== "sleep") || event.endedAt !== null || event.deletedAt) throw new Error("Timer is not active");
        const endedAt = this.dependencies.clock.now();
        if (endedAt < event.startedAt) throw new Error("Timer cannot end before it starts");
        await this.dependencies.repository.revise(CareEventSchema.parse({ ...event, endedAt, updatedAt: endedAt }));
        this.undoAction = async () => { await this.dependencies.repository.revise(event); };
        await this.refreshEventsWithinIdentityMutation();
      });
    });
  }

  async undo(): Promise<void> {
    const action = this.undoAction;
    if (!action) return;
    await this.setAction(async () => {
      await this.coordinateCareMutation(async () => {
        await action();
        this.undoAction = null;
        await this.refreshEventsWithinIdentityMutation();
      });
    });
  }

  private parseCapture = async (): Promise<void> => {
    this.ensureActive();
    this.captureError = null;
    const outcomes = parseCareEvents(this.captureSource, { now: this.dependencies.clock.now(), timeZone: this.profile.timeZone, babyId: this.profile.babyId });
    this.proposals = outcomes.flatMap((outcome) => outcome.outcome === "proposed" ? [{ value: clone(outcome), edited: false }] : []);
    this.refusals = outcomes.flatMap((outcome): RefusalViewModel[] => outcome.outcome === "refused" ? [{ clientId: outcome.clientId, sourceText: outcome.sourceText, reason: outcome.refusalReason, explanation: outcome.explanation }] : []);
    this.captureStage = "review";
    this.notify();
    await Promise.all([
      ...this.proposals.map(() => this.metric("event_proposed")),
      ...this.refusals.map(() => this.metric("parser_refused")),
      this.metric(this.captureOrigin === "voice" ? "capture_voice" : "capture_typed"),
    ]);
  };

  private correctProposal(clientId: string, path: string, value: string | number | null): void {
    this.ensureActive();
    const editable = this.proposals.find((candidate) => candidate.value.clientId === clientId);
    if (!editable) return;
    const next = clone(editable.value);
    if (path.startsWith("fields.")) next.fields[path.slice("fields.".length)] = value;
    else if (path === "startedAt") next.startedAt = typeof value === "string" && value ? value : null;
    else if (path === "endedAt") next.endedAt = typeof value === "string" && value ? value : null;
    else if (path === "babyId") next.babyId = typeof value === "string" && value ? value : null;
    next.unresolved = next.unresolved.filter((unresolved) => unresolved !== path || !isPresent(value));
    if (!isPresent(value) && !next.unresolved.includes(path)) next.unresolved.push(path);
    editable.value = next;
    editable.edited = true;
    this.notify();
  }

  private async confirmCapture(): Promise<void> {
    this.captureStage = "committing";
    this.captureError = null;
    this.notify();
    let batchCommitted = false;
    try {
      await this.coordinateCareMutation(async () => {
        if (!this.proposals.length) throw new Error("No proposals to save");
        const now = this.dependencies.clock.now();
        const events = this.proposals.map((proposal) => editableEvent(proposal.value, this.profile, now, this.dependencies.idFactory?.() ?? defaultId(), this.captureOrigin, this.dependencies.clock, this.mode));
        await this.dependencies.repository.appendBatch(events);
        batchCommitted = true;
        this.undoAction = async () => {
          const deletedAt = this.dependencies.clock.now();
          await Promise.all(events.map((event) => this.dependencies.repository.softDelete(event.householdId, event.id, deletedAt)));
        };
        await this.refreshAfterCommitWithinIdentityMutation(events);
        await Promise.all(this.proposals.map((proposal) => this.recordMetricWithinIdentityMutation(proposal.edited ? "event_confirmed_edited" : "event_confirmed_unchanged")));
        this.proposals = [];
        this.captureStage = "committed";
      });
    } catch {
      if (batchCommitted) {
        this.proposals = [];
        this.captureStage = "committed";
        this.captureError = null;
      } else {
        this.captureStage = "error";
        this.captureError = this.captureError ?? captureError("Review every highlighted field. No entries were saved.");
      }
    }
    this.notify();
  }

  private resetCapture(): void {
    this.ensureActive();
    this.dependencies.speech.cancel();
    this.captureStage = "idle";
    this.captureError = null;
    this.captureSource = "";
    this.captureOrigin = "typed";
    this.proposals = [];
    this.refusals = [];
    this.speechState = { status: "idle" };
    this.notify();
  }

  async probeSpeech(openDisclosure = true): Promise<void> {
    this.ensureActive();
    this.speechState = { status: "probing" };
    this.notify();
    const language = this.profile.locale;
    try {
      const capability = await this.dependencies.speech.capability(language);
      if (!capability.available || capability.locality === "unavailable") {
        this.speechState = capability.reason?.toLowerCase().includes("denied") ? { status: "denied", reason: "Microphone permission is denied in this browser." } : { status: "unavailable", reason: capability.reason ?? "Speech recognition is unavailable." };
      } else if (capability.locality === "browser-service") {
        this.speechState = { status: "disclosure", service: "browser-service", language: capability.language };
        if (openDisclosure) this.captureStage = "speech-disclosure";
      } else this.speechState = { status: "ready", locality: "local-confirmed", language: capability.language };
    } catch { this.speechState = { status: "unavailable", reason: "Speech recognition is unavailable." }; }
    this.notify();
  }

  private async acceptSpeech(): Promise<void> {
    this.ensureActive();
    const language = "language" in this.speechState ? this.speechState.language : this.profile.locale;
    const locality = "locality" in this.speechState ? this.speechState.locality : this.speechState.status === "disclosure" ? "browser-service" : "browser-service";
    this.captureOrigin = "voice";
    this.speechState = { status: "requesting-permission", locality };
    this.notify();
    try {
      await this.dependencies.speech.start(language, (text) => {
        if (!this.acceptingMutations || this.terminated || this.disposing || this.disposed) return;
        this.captureSource = `${this.captureSource} ${text}`.trim();
        this.speechState = { status: "listening", locality, interim: "" };
        this.notify();
      }, (interim) => {
        if (!this.acceptingMutations || this.terminated || this.disposing || this.disposed) return;
        this.speechState = { status: "listening", locality, interim };
        this.notify();
      });
      this.speechState = { status: "listening", locality, interim: "" };
      this.captureStage = "listening";
    } catch (error) {
      this.captureStage = "error";
      if (error instanceof SpeechAccessError && error.code === "denied") {
        this.speechState = { status: "denied", reason: "Microphone permission was denied. Typed capture is still available." };
        this.captureError = captureError("Microphone permission was denied. You can type the entry instead.");
      } else {
        this.speechState = { status: "error", reason: "Speech recognition could not start." };
        this.captureError = captureError("Speech recognition could not start. You can type the entry instead.");
      }
    }
    this.notify();
  }

  private async stopSpeech(): Promise<void> {
    this.ensureActive();
    this.dependencies.speech.stop();
    if (this.captureSource.trim()) await this.parseCapture();
    else {
      this.captureStage = "error";
      this.captureError = captureError("No speech was transcribed. Try again or type the entry.");
      this.notify();
    }
  }

  private cancelSpeech(): void {
    this.ensureActive();
    this.dependencies.speech.cancel();
    this.captureStage = "idle";
    this.captureOrigin = "typed";
    this.speechState = { status: "idle" };
    this.notify();
  }

  private beginEdit(id: string): void {
    this.ensureActive();
    const event = this.events.find((candidate) => candidate.id === id && !candidate.deletedAt);
    this.editing = event ? toEditDraft(event) : null;
    this.notify();
  }

  private async saveEdit(): Promise<void> {
    const draft = this.editing;
    if (!draft) return;
    await this.setAction(async () => {
      await this.coordinateCareMutation(async () => {
        const current = await this.dependencies.repository.get(this.profile.householdId, draft.id);
        if (!current || current.deletedAt) throw new Error("Event is unavailable");
        const fields = { ...current.fields } as Record<string, unknown>;
        for (const [key, value] of Object.entries(draft.fields)) if (key.startsWith("fields.")) fields[key.slice("fields.".length)] = value;
        const updatedAt = this.dependencies.clock.now();
        const revised = CareEventSchema.parse({
          ...current,
          startedAt: typeof draft.fields.startedAt === "string" ? draft.fields.startedAt : current.startedAt,
          endedAt: draft.fields.endedAt === null || typeof draft.fields.endedAt === "string" ? draft.fields.endedAt : current.endedAt,
          fields,
          updatedAt,
        });
        await this.dependencies.repository.revise(revised);
        this.undoAction = async () => { await this.dependencies.repository.revise(current); };
        this.editing = null;
        await this.refreshEventsWithinIdentityMutation();
      });
    });
  }

  private async confirmDelete(): Promise<void> {
    const id = this.deletingId;
    if (!id) return;
    await this.setAction(async () => {
      await this.coordinateCareMutation(async () => {
        const householdId = this.profile.householdId;
        await this.dependencies.repository.softDelete(householdId, id, this.dependencies.clock.now());
        this.undoAction = async () => { await this.dependencies.repository.restore(householdId, id); };
        this.deletingId = null;
        await this.refreshEventsWithinIdentityMutation();
      });
    });
  }

  private shiftPayload(): CurrentHandoffPayload {
    const now = this.dependencies.clock.now();
    const hours = Number(this.handoffBoundary);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 72) throw new Error("Invalid handoff boundary");
    const shiftStart = new Date(Date.parse(now) - hours * 3_600_000).toISOString();
    return generateHandoffPayload({ events: this.events, provenance: this.mode, generatedAt: now, babyLabel: this.profile.nickname, timeZone: this.profile.timeZone, shiftStart, shiftEnd: now });
  }

  private previewShiftPayload(): CurrentHandoffPayload {
    const eventVersion = this.events.map((event) => `${event.id}:${event.updatedAt}:${event.deletedAt ?? "active"}`).join("|");
    const key = `${this.handoffBoundary}:${this.profile.nickname}:${this.profile.timeZone}:${eventVersion}`;
    if (this.handoffPreviewCache?.key === key) return this.handoffPreviewCache.payload;
    const payload = this.shiftPayload();
    this.handoffPreviewCache = { key, payload };
    return payload;
  }

  private async generateHandoff(transport: HandoffTransport): Promise<void> {
    this.ensureActive();
    this.handoffArtifact = { status: "preparing" };
    this.notify();
    const limit = transport === "qr" ? HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes : HANDOFF_ARTIFACT_BOUNDS.urlFragmentBytes;
    try {
      const payload = this.handoffPreviewCache?.payload;
      if (!payload) throw new Error("Review the current handoff before generating it");
      const { fragment, url, byteCount } = handoffTransportsFor(payload, this.dependencies.origin ?? "");
      if (byteCount > limit) {
        this.handoffArtifact = { status: "too-large", byteCount, byteLimit: limit };
        this.notify();
        return;
      }
      const qrDataUrl = transport === "qr" ? await QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: "M" }) : undefined;
      this.handoffUrl = url;
      this.handoffArtifact = {
        status: "ready", transport, fragment, ...(qrDataUrl ? { qrDataUrl } : {}), byteCount, byteLimit: limit,
        expiryLabel: `Expires ${formatDate(payload.expiresAt, this.locale())}, ${formatTime(payload.expiresAt, this.locale())}`,
      };
      await this.metric("handoff_generated");
      if (transport === "qr") await this.metric("handoff_qr_displayed");
    } catch (error) {
      this.handoffArtifact = error instanceof RangeError ? { status: "too-large", byteCount: limit + 1, byteLimit: limit } : { status: "error", reason: safeReason() };
    }
    this.notify();
  }

  async openPass(fragment: string): Promise<PassViewerState> {
    this.ensureActive();
    try {
      const framed = fragment.includes("#handoff=") ? fragment.slice(fragment.indexOf("#handoff=")) : fragment;
      const payload = decodeHandoffFragment(framed);
      const sourceLocale = { locale: this.profile.locale, timeZone: payload.timeZone };
      if (isHandoffExpired(payload, this.dependencies.clock.now())) this.passState = { status: "expired", payload };
      else {
        this.passState = {
          status: "valid",
          payload,
          summary: summarizeHandoffPayload(payload),
          generatedLabel: `Generated ${formatDate(payload.generatedAt, sourceLocale)}, ${formatTime(payload.generatedAt, sourceLocale)}`,
          expiryLabel: `Expires ${formatDate(payload.expiresAt, sourceLocale)}, ${formatTime(payload.expiresAt, sourceLocale)}`,
          events: passEventRows(payload, sourceLocale),
        };
        await this.metric("handoff_opened");
      }
    } catch { this.passState = { status: "invalid", reason: "This handoff link is invalid or damaged." }; }
    this.notify();
    return this.passState;
  }

  private async exportData(format: "json" | "csv" | "metrics-json"): Promise<void> {
    this.ensureActive();
    this.exportPhase = "pending";
    this.notify();
    try {
      const now = this.dependencies.clock.now();
      let download: RuntimeDownload;
      if (format === "json") {
        const text = stringifyRuntimeBackup({ generatedAt: now, realm: this.mode, profile: this.profile, events: await this.exportEvents(this.profile.householdId) });
        download = { name: `nuzzlecue-backup-${extensionTimestamp(now)}.json`, type: "application/json", data: new Blob([text], { type: "application/json" }) };
      } else if (format === "csv") {
        const bytes = createCsvProvenanceZip(await this.exportEvents(this.profile.householdId), { householdId: this.profile.householdId, generatedAt: now });
        download = { name: `nuzzlecue-events-${extensionTimestamp(now)}.zip`, type: "application/zip", data: new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }) };
      } else {
        download = { name: `nuzzlecue-metrics-${extensionTimestamp(now)}.json`, type: "application/json", data: new Blob([await this.exportMetrics()], { type: "application/json" }) };
      }
      await this.dependencies.download?.(download);
      await this.metric("export_created");
      this.exportPhase = "success";
    } catch { this.exportPhase = "error"; }
    this.notify();
  }

  private invalidateForStaleDataGeneration(): void {
    if (this.terminated) return;
    this.acceptingMutations = false;
    this.terminated = true;
    this.events = [];
    this.undoAction = null;
    this.editing = null;
    this.deletingId = null;
    this.importCandidate = null;
    this.importBaselineIdentity = null;
    this.lastImportResult = null;
    this.importState = { status: "error", reason: "Local browser data was deleted in another tab. Reload before restoring a backup." };
    try { this.dependencies.speech.cancel(); } catch { /* Generation invalidation must still complete. */ }
    this.captureSource = "";
    this.captureOrigin = "typed";
    this.proposals = [];
    this.refusals = [];
    this.speechState = { status: "idle" };
    this.captureStage = "error";
    this.captureError = captureError("Local browser data was deleted in another tab. Reload before entering new care data.");
    this.passState = { status: "empty" };
    this.actionPhase = "error";
    this.onboardingPhase = "error";
    this.resetPhase = "error";
    this.profile = createDefaultProfile(this.mode, this.profile.timeZone);
    this.onboardingDraft = this.draftFromProfile(this.profile);
    this.invalidateHandoffReview();
    this.notify();
  }

  private assertCurrentDataGeneration(expected: string): void {
    try {
      if (this.dependencies.dataGenerationStore.read() === expected) return;
    } catch { /* An unreadable fence cannot authorize a durable mutation. */ }
    this.invalidateForStaleDataGeneration();
    throw new DataGenerationMismatchError();
  }

  private async coordinateIdentityMutation<T>(work: () => Promise<T>): Promise<T> {
    const expectedGeneration = this.dataGeneration;
    if (!this.dependencies.identityLock.available) {
      this.assertCurrentDataGeneration(expectedGeneration);
      return work();
    }
    return this.dependencies.identityLock.runExclusive(this.mode, async () => {
      this.assertCurrentDataGeneration(expectedGeneration);
      return work();
    });
  }

  private synchronizeRuntimeProfile(profile: BrowserProfile): boolean {
    const nextProfile = clone(profile);
    const identityChanged = nextProfile.householdId !== this.profile.householdId
      || nextProfile.babyId !== this.profile.babyId;
    const captureNeedsReentry = Boolean(this.captureSource.trim())
      || this.proposals.length > 0 || this.refusals.length > 0
      || this.captureStage === "speech-disclosure" || this.captureStage === "listening"
      || this.captureStage === "review" || this.captureStage === "committing"
      || this.speechState.status !== "idle";
    this.profile = nextProfile;
    this.onboardingDraft = this.draftFromProfile(this.profile);
    if (identityChanged) {
      this.events = [];
      this.undoAction = null;
      this.editing = null;
      this.deletingId = null;
      try { this.dependencies.speech.cancel(); } catch { /* Identity transition must still complete. */ }
      this.captureSource = "";
      this.captureOrigin = "typed";
      this.proposals = [];
      this.refusals = [];
      this.speechState = { status: "idle" };
      this.captureStage = captureNeedsReentry ? "error" : "idle";
      this.captureError = captureNeedsReentry
        ? captureError("The active household or baby changed. Start this care entry again before saving.")
        : null;
    }
    this.invalidateHandoffReview();
    return identityChanged;
  }

  private async coordinateCareMutation<T>(work: () => Promise<T>): Promise<T> {
    return this.coordinateIdentityMutation(async () => {
      const persistedProfile = clone(this.dependencies.profileStore.read());
      const identityChanged = persistedProfile.householdId !== this.profile.householdId
        || persistedProfile.babyId !== this.profile.babyId;
      if (identityChanged) {
        this.synchronizeRuntimeProfile(persistedProfile);
        this.notify();
        try {
          this.events = await this.listEventsWithinIdentityMutation({ householdId: persistedProfile.householdId, includeDeleted: true });
        } catch { this.events = []; }
        this.notify();
        throw new Error("Browser identity changed; retry the care update against the active household and baby");
      }
      return work();
    });
  }

  private async updatePersistedProfile(update: (persisted: BrowserProfile) => BrowserProfile): Promise<void> {
    await this.coordinateIdentityMutation(async () => {
      const persistedProfile = clone(this.dependencies.profileStore.read());
      const identityChanged = persistedProfile.householdId !== this.profile.householdId
        || persistedProfile.babyId !== this.profile.babyId;
      if (identityChanged) {
        this.synchronizeRuntimeProfile(persistedProfile);
        this.events = await this.listEventsWithinIdentityMutation({ householdId: persistedProfile.householdId, includeDeleted: true });
      }
      const nextProfile = BrowserProfileSchema.parse(update(persistedProfile));
      if (nextProfile.householdId !== persistedProfile.householdId || nextProfile.babyId !== persistedProfile.babyId) {
        throw new Error("Ordinary profile updates cannot change household or baby identity");
      }
      this.dependencies.profileStore.write(nextProfile);
      this.synchronizeRuntimeProfile(nextProfile);
    });
  }

  private hasDefaultProfileState(profile = this.profile): boolean {
    const defaults = createDefaultProfile(this.mode, profile.timeZone);
    return profile.version === defaults.version && profile.realm === defaults.realm
      && profile.householdId === defaults.householdId && profile.babyId === defaults.babyId
      && profile.nickname === defaults.nickname && profile.locale === defaults.locale
      && profile.volumeUnit === defaults.volumeUnit && profile.dayBoundary === defaults.dayBoundary
      && profile.onboardingComplete === defaults.onboardingComplete && profile.tracked.join(",") === defaults.tracked.join(",")
      && profile.preferences.nursery === defaults.preferences.nursery
      && profile.preferences.reducedMotion === defaults.preferences.reducedMotion;
  }

  private backupChangesBoundary(backup: RuntimeBackup): boolean {
    return backup.profile.householdId !== this.profile.householdId || backup.profile.babyId !== this.profile.babyId;
  }

  private async chooseImport(candidate: ImportCandidate): Promise<void> {
    this.ensureActive();
    this.importState = { status: "reading", fileName: candidate.name };
    this.importCandidate = null;
    this.importBaselineIdentity = null;
    this.notify();
    try {
      const backup = parseRuntimeBackup(candidate.text, this.mode);
      const changesBoundary = this.backupChangesBoundary(backup);
      if (changesBoundary && backup.events.length === 0) {
        this.importState = { status: "error", reason: "A backup for a different household or baby must contain at least one care event before this browser can adopt its identity." };
        this.notify();
        return;
      }
      if (changesBoundary && (!this.hasDefaultProfileState() || !await this.repositoryIsEmpty())) {
        this.importState = { status: "error", reason: "A different household or baby can only be restored into a completely empty, unconfigured browser profile." };
        this.notify();
        return;
      }
      this.importCandidate = backup;
      this.importBaselineIdentity = { householdId: this.profile.householdId, babyId: this.profile.babyId };
      const warnings: string[] = [];
      const deleted = backup.events.filter((event) => event.deletedAt).length;
      if (deleted) warnings.push(`${deleted} soft-deleted records are included for faithful restore.`);
      if (changesBoundary) warnings.push("The backup profile is saved separately before its non-empty event snapshot is adopted into this empty repository. Recovery errors are shown if either store fails.");
      else if (this.events.length) warnings.push("The event snapshot replaces existing household records in one repository transaction, including soft-deleted or quarantined data. Profile settings are activated separately afterward.");
      this.importState = { status: "review", fileName: candidate.name, eventCount: backup.events.length, warnings };
    } catch { this.importState = { status: "error", reason: "The selected JSON backup cannot be safely restored into this data mode." }; }
    this.notify();
  }

  private async confirmImport(): Promise<void> {
    const backup = this.importCandidate;
    if (!backup || this.importState.status !== "review") return;
    const fileName = this.importState.fileName;
    const baselineIdentity = this.importBaselineIdentity ?? { householdId: this.profile.householdId, babyId: this.profile.babyId };
    this.importState = { status: "importing", fileName };
    this.notify();
    const previousProfile = clone(this.profile);
    const changesBoundary = backup.profile.householdId !== baselineIdentity.householdId
      || backup.profile.babyId !== baselineIdentity.babyId;
    let committedProfile = clone(backup.profile);

    if (changesBoundary) {
      if (backup.events.length === 0) {
        this.importCandidate = null;
        this.importBaselineIdentity = null;
        this.importState = { status: "error", reason: "A different household or baby cannot be adopted from an empty event snapshot." };
        this.notify();
        return;
      }
      if (!this.dependencies.identityLock.available) {
        this.importCandidate = null;
        this.importBaselineIdentity = null;
        this.importState = { status: "error", reason: "A trustworthy browser-wide identity lock is unavailable, so a different household or baby cannot be safely adopted. No profile or events were changed." };
        this.notify();
        return;
      }

      let adopted = false;
      try {
        await this.coordinateIdentityMutation(async () => {
          const persistedProfile = clone(this.dependencies.profileStore.read());
          const identityDrifted = persistedProfile.householdId !== baselineIdentity.householdId
            || persistedProfile.babyId !== baselineIdentity.babyId;
          if (identityDrifted) {
            this.synchronizeRuntimeProfile(persistedProfile);
            this.events = await this.listEventsWithinIdentityMutation({ householdId: persistedProfile.householdId, includeDeleted: true });
            this.importState = { status: "error", reason: "This browser identity changed after review. The newer household and baby remain active, and this stale backup was not adopted." };
            this.invalidateHandoffReview();
            return;
          }

          if (!this.hasDefaultProfileState(persistedProfile) || !await this.repositoryIsEmptyWithinIdentityMutation()) {
            this.synchronizeRuntimeProfile(persistedProfile);
            this.events = await this.listEventsWithinIdentityMutation({ householdId: persistedProfile.householdId, includeDeleted: true });
            this.importState = { status: "error", reason: "This browser changed after review. A different household or baby still requires an empty, unconfigured browser profile." };
            this.invalidateHandoffReview();
            return;
          }

          try { this.dependencies.profileStore.write(backup.profile); }
          catch {
            try { this.synchronizeRuntimeProfile(this.dependencies.profileStore.read()); } catch { this.synchronizeRuntimeProfile(persistedProfile); }
            this.events = [];
            this.importState = { status: "error", reason: "The backup profile could not be activated, so no events were adopted. Reload and review local profile settings before retrying." };
            return;
          }

          try {
            await this.dependencies.repository.adoptSnapshot(backup.profile.householdId, backup.events);
            adopted = true;
          } catch {
            try {
              this.dependencies.profileStore.write(persistedProfile);
              this.synchronizeRuntimeProfile(persistedProfile);
              this.events = [];
              this.importState = { status: "error", reason: "The event adoption transaction failed. The previous empty profile was restored and no backup events were committed." };
            } catch {
              try { this.synchronizeRuntimeProfile(this.dependencies.profileStore.read()); } catch { this.synchronizeRuntimeProfile(backup.profile); }
              this.events = [];
              this.importState = { status: "error", reason: "Event adoption failed, and the backup profile could not be rolled back. No events were adopted, but the backup profile may remain active. Reload before retrying or deleting local data." };
            }
            this.invalidateHandoffReview();
          }
        });
      } catch {
        if (!adopted) this.importState = { status: "error", reason: "The browser-wide identity lock could not complete, so a different household or baby was not adopted. No profile or events were intentionally changed." };
      }

      if (!adopted) {
        if (this.importState.status === "importing") {
          this.importState = { status: "error", reason: "The browser-wide identity lock did not complete the adoption. No profile or events were intentionally changed." };
        }
        this.importCandidate = null;
        this.importBaselineIdentity = null;
        this.notify();
        return;
      }
    } else {
      let restored = false;
      const restoreSameBoundary = async (): Promise<void> => {
        const persistedProfile = clone(this.dependencies.profileStore.read());
        const identityDrifted = persistedProfile.householdId !== baselineIdentity.householdId
          || persistedProfile.babyId !== baselineIdentity.babyId;
        if (identityDrifted) {
          this.synchronizeRuntimeProfile(persistedProfile);
          this.events = await this.listEventsWithinIdentityMutation({ householdId: persistedProfile.householdId, includeDeleted: true });
          this.importState = { status: "error", reason: "This browser identity changed after review. The newer household and baby remain active, and this stale same-identity backup was not restored." };
          this.invalidateHandoffReview();
          return;
        }

        try { await this.dependencies.repository.restoreSnapshot(persistedProfile.householdId, backup.events); }
        catch {
          this.importState = { status: "error", reason: "The event restore transaction failed. Profile settings were not changed and the previous event snapshot remains available." };
          return;
        }

        const activatedProfile = BrowserProfileSchema.parse({
          ...backup.profile,
          householdId: persistedProfile.householdId,
          babyId: persistedProfile.babyId,
        });
        try { this.dependencies.profileStore.write(activatedProfile); }
        catch {
          try { this.synchronizeRuntimeProfile(this.dependencies.profileStore.read()); } catch { this.synchronizeRuntimeProfile(previousProfile); }
          this.events = backup.events.map(clone).sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
          this.importState = { status: "error", reason: "Care records were restored, but backup profile settings could not be confirmed. Records remain available because the household and baby identifiers did not change. Reload and review settings before retrying." };
          return;
        }
        committedProfile = activatedProfile;
        restored = true;
      };

      try { await this.coordinateIdentityMutation(restoreSameBoundary); }
      catch {
        if (!restored) this.importState = { status: "error", reason: "Identity coordination could not complete the restore, so the backup was not safely activated." };
      }
      if (!restored) {
        this.importCandidate = null;
        this.importBaselineIdentity = null;
        this.notify();
        return;
      }
    }

    this.lastImportResult = { imported: backup.events.length, skipped: 0 };
    this.synchronizeRuntimeProfile(committedProfile);
    this.events = backup.events.map(clone).sort((left, right) => left.startedAt.localeCompare(right.startedAt) || left.id.localeCompare(right.id));
    this.importCandidate = null;
    this.importBaselineIdentity = null;
    this.importState = { status: "success", importedCount: backup.events.length };
    this.notify();
  }

  async wipe(confirmation: string): Promise<boolean> {
    this.ensureActive();
    if (confirmation !== "DELETE" || !this.dependencies.identityLock.available) {
      this.wipePhase = "error";
      this.notify();
      return false;
    }
    this.wipePhase = "pending";
    this.notify();
    const expectedGeneration = this.dataGeneration;
    return this.enqueueMutation(async () => {
      let criticalSectionStarted = false;
      try {
        // Terminalization happens synchronously in enqueueMutation. An initialization
        // that was already in flight may finish, but no later controller mutation can
        // enter the queue before the browser-wide wipe lock is requested.
        if (this.initializationPromise) await Promise.allSettled([this.initializationPromise]);
        this.ensureRuntimeUsable();
        return await this.dependencies.identityLock.runGlobalExclusive(async () => {
          criticalSectionStarted = true;
          this.assertCurrentDataGeneration(expectedGeneration);
          await this.recordMetricWithinIdentityMutation("delete_all_completed");
          this.terminated = true;
          this.events = [];
          this.undoAction = null;
          this.editing = null;
          this.deletingId = null;
          this.importCandidate = null;
          this.importBaselineIdentity = null;
          this.importState = { status: "idle" };
          this.captureSource = "";
          this.proposals = [];
          this.refusals = [];
          this.passState = { status: "empty" };
          this.profile = createDefaultProfile(this.mode, this.profile.timeZone);
          this.onboardingDraft = this.draftFromProfile(this.profile);
          this.invalidateHandoffReview();

          const failures: unknown[] = [];
          try { this.dependencies.clearAllProfiles?.(); } catch (error) { failures.push(error); }
          try { this.dependencies.profileStore.clear(); } catch (error) { failures.push(error); }
          try {
            if (!this.dependencies.deleteAllData) throw new Error("Local deletion port is unavailable");
            await this.dependencies.deleteAllData();
          } catch (error) { failures.push(error); }
          // Rotate even after a partial deletion failure. Successfully deleted stores
          // must never be recreated by queued work from an older browser tab.
          try { this.dataGeneration = this.dependencies.dataGenerationStore.rotate(expectedGeneration); }
          catch (error) { failures.push(error); }

          this.wipePhase = failures.length ? "error" : "success";
          this.notify();
          return failures.length === 0;
        });
      } catch {
        if (!criticalSectionStarted && !this.terminated) this.acceptingMutations = true;
        this.wipePhase = "error";
        this.notify();
        return false;
      }
    }, true);
  }

  private async resetDemo(): Promise<void> {
    if (this.mode !== "demo") return;
    this.resetPhase = "pending";
    this.notify();
    try {
      await this.coordinateCareMutation(async () => {
        await this.dependencies.repository.purgeAll(this.profile.householdId);
        const seed = createDemoSeed({ householdId: this.profile.householdId, babyId: this.profile.babyId, timeZone: this.profile.timeZone, anchorInstant: this.dependencies.clock.now() });
        await this.dependencies.repository.import(this.profile.householdId, seed);
        await this.refreshEventsWithinIdentityMutation();
        this.undoAction = null;
      });
      this.resetPhase = "success";
    } catch { this.resetPhase = "error"; }
    this.notify();
  }

  getSnapshot = (): ExperienceControllerSet => {
    const now = this.dependencies.clock.now();
    const locale = this.locale();
    const active = this.activeEvents();
    const recent = [...active].sort((left, right) => right.startedAt.localeCompare(left.startedAt)).slice(0, 8);
    const activeTimers = this.openTimers().map((event) => {
      const elapsedMs = Math.max(0, Date.parse(now) - Date.parse(event.startedAt));
      const totalMinutes = Math.floor(elapsedMs / 60_000);
      return {
        id: event.id,
        type: event.type as "feed" | "sleep",
        title: event.type === "feed" ? "Feeding timer" : "Sleep timer",
        startedAtEpochMs: Date.parse(event.startedAt),
        startedLabel: `Started ${formatTime(event.startedAt, locale)}`,
        elapsedLabel: `${Math.floor(totalMinutes / 60).toString().padStart(2, "0")}:${(totalMinutes % 60).toString().padStart(2, "0")}:00`,
        pending: this.actionPhase === "pending",
      };
    });
    const today = {
      mode: this.mode,
      title: this.profile.nickname,
      dateLabel: formatDate(now, locale),
      dayBoundaryLabel: `Day boundary ${this.profile.dayBoundary}`,
      volumeUnit: this.profile.volumeUnit,
      quickActions: ["bottle", "nursing", "diaper", "sleep", "pumping", "solids", "tummy-time"] as const,
      activeTimers,
      recentEvents: recent.map((event) => toEventRow(event, locale)),
      canUndo: Boolean(this.undoAction),
      phase: this.actionPhase,
      onQuickLog: (draft: ManualQuickLogDraft) => this.quickLog(draft),
      onStartTimer: async (type: "feed" | "sleep") => { await this.startTimer(type); },
      onStopTimer: (id: string) => this.stopTimer(id),
      onUndo: () => this.undo(),
    };
    const captureBase = {
      sourceText: this.captureSource,
      speech: this.speechState,
      proposals: this.proposals.map(proposalView),
      refusals: this.refusals,
      onSourceTextChange: (value: string) => this.mutateState(() => { this.captureSource = value; this.captureOrigin = "typed"; this.notify(); }),
      onParse: () => this.enqueueMutation(() => this.parseCapture()),
      onProbeSpeech: () => this.enqueueMutation(() => this.probeSpeech()),
      onAcceptSpeechDisclosure: () => this.enqueueMutation(() => this.acceptSpeech()),
      onStopSpeech: () => this.enqueueMutation(() => this.stopSpeech()),
      onCancelSpeech: () => this.cancelSpeech(),
      onCorrect: (clientId: string, path: string, value: string | number | null) => this.correctProposal(clientId, path, value),
      onConfirm: () => this.enqueueMutation(() => this.confirmCapture()),
      onReset: () => this.resetCapture(),
    };
    const capture: CapturePageProps = this.captureStage === "error"
      ? { ...captureBase, stage: "error", error: this.captureError ?? captureError() }
      : { ...captureBase, stage: this.captureStage, error: null };
    const timeline = {
      filter: this.timelineFilter,
      groups: timelineGroups(active, locale, this.timelineFilter),
      editing: this.editing,
      deletingId: this.deletingId,
      canUndo: Boolean(this.undoAction),
      phase: this.actionPhase,
      onFilterChange: (filter: TimelinePageProps["filter"]) => this.mutateState(() => { this.timelineFilter = filter; this.notify(); }),
      onEdit: (id: string) => this.beginEdit(id),
      onEditChange: (fields: EventEditDraft["fields"]) => this.mutateState(() => { if (this.editing) this.editing = { ...this.editing, fields }; this.notify(); }),
      onSaveEdit: () => this.saveEdit(),
      onCancelEdit: () => this.mutateState(() => { this.editing = null; this.notify(); }),
      onDelete: (id: string) => this.mutateState(() => { this.deletingId = id; this.notify(); }),
      onConfirmDelete: () => this.confirmDelete(),
      onUndo: () => this.undo(),
    } satisfies TimelinePageProps;
    const handoffReview = (() => {
      if (!this.acceptingMutations || this.terminated || this.disposing || this.disposed) return null;
      try {
        const payload = this.previewShiftPayload();
        return { summary: summarizeHandoffPayload(payload), events: passEventRows(payload, { locale: this.profile.locale, timeZone: payload.timeZone }) };
      } catch {
        return null;
      }
    })();
    return {
      mode: this.mode,
      home: { mode: this.mode },
      onboarding: {
        step: this.onboardingStep,
        draft: this.onboardingDraft,
        availableTimeZones: this.availableTimeZones(),
        phase: this.onboardingPhase,
        onChange: (key, value) => this.mutateState(() => { this.onboardingDraft = { ...this.onboardingDraft, [key]: value }; this.notify(); }),
        onToggleTracking: (type) => this.mutateState(() => { const tracked = this.onboardingDraft.tracked.includes(type) ? this.onboardingDraft.tracked.filter((candidate) => candidate !== type) : [...this.onboardingDraft.tracked, type]; this.onboardingDraft = { ...this.onboardingDraft, tracked }; this.notify(); }),
        onBack: () => this.mutateState(() => { this.onboardingStep = Math.max(1, this.onboardingStep - 1) as 1 | 2 | 3; this.notify(); }),
        onNext: () => this.mutateState(() => { this.onboardingStep = Math.min(3, this.onboardingStep + 1) as 1 | 2 | 3; this.notify(); }),
        onComplete: () => this.enqueueMutation(async () => {
          this.onboardingPhase = "pending"; this.notify();
          try {
            this.dependencies.clock.wallClock(this.dependencies.clock.now(), this.onboardingDraft.timeZone);
            await this.updatePersistedProfile((persistedProfile) => BrowserProfileSchema.parse({ ...persistedProfile, nickname: this.onboardingDraft.babyLabel.trim(), timeZone: this.onboardingDraft.timeZone, locale: this.onboardingDraft.locale, volumeUnit: this.onboardingDraft.volumeUnit, tracked: [...this.onboardingDraft.tracked], onboardingComplete: true }));
            await this.metric("onboarding_completed");
            this.onboardingPhase = "success";
          } catch { this.onboardingPhase = "error"; }
          this.notify();
        }),
      },
      today,
      demo: { today, resetPhase: this.resetPhase, onReset: () => this.enqueueMutation(() => this.resetDemo()) },
      capture,
      timeline,
      insights: buildInsightsView(active, now, this.mode, locale),
      handoff: {
        mode: this.mode,
        boundary: this.handoffBoundary,
        boundaryOptions: [{ label: "Past 4 hours", value: "4" }, { label: "Past 8 hours", value: "8" }, { label: "Past 12 hours", value: "12" }, { label: "Past 24 hours", value: "24" }],
        summary: handoffReview?.summary ?? null,
        recentEvents: handoffReview?.events ?? [],
        artifact: this.handoffArtifact,
        onBoundaryChange: (value: string) => this.mutateState(() => { this.handoffBoundary = value; this.invalidateHandoffReview(); this.notify(); }),
        onGenerate: (transport: HandoffTransport) => this.enqueueMutation(() => this.generateHandoff(transport)),
        onCopyLink: async () => { this.ensureActive(); if (this.handoffUrl) await this.dependencies.copyText?.(this.handoffUrl); },
        onReset: () => this.mutateState(() => { this.handoffArtifact = { status: "idle" }; this.handoffUrl = null; this.notify(); }),
      },
      privacy: {
        storage: this.persistence,
        storageEstimate: { ...this.storageEstimate },
        exportPhase: this.exportPhase,
        importState: this.importState,
        wipePhase: this.wipePhase,
        onRequestPersistence: () => this.enqueueMutation(async () => {
          this.persistence = "requesting";
          this.notify();
          try {
            const granted = await this.dependencies.storage.requestPersistence();
            await this.refreshStorageStatus();
            if (!granted) this.persistence = "denied";
          } catch { this.persistence = "unavailable"; }
          this.notify();
        }),
        onExport: (format) => this.enqueueMutation(() => this.exportData(format)),
        onChooseImport: (candidate) => this.enqueueMutation(() => this.chooseImport(candidate)),
        onConfirmImport: () => this.enqueueMutation(() => this.confirmImport()),
        onCancelImport: () => this.mutateState(() => { this.importCandidate = null; this.importBaselineIdentity = null; this.importState = { status: "idle" }; this.notify(); }),
        onWipe: async (confirmation: string) => { await this.wipe(confirmation); },
      },
      settings: {
        preferences: this.profile.preferences,
        profile: { nickname: this.profile.nickname, timeZone: this.profile.timeZone, volumeUnit: this.profile.volumeUnit, dayBoundary: this.profile.dayBoundary },
        availableTimeZones: this.availableTimeZones(),
        phase: this.actionPhase,
        onPreferenceChange: (key, value) => this.enqueueMutation(async () => { await this.updatePersistedProfile((persistedProfile) => BrowserProfileSchema.parse({ ...persistedProfile, preferences: { ...persistedProfile.preferences, [key]: value } })); this.notify(); }),
        onProfileSave: async (input) => {
          await this.setAction(async () => {
            this.dependencies.clock.wallClock(this.dependencies.clock.now(), input.timeZone);
            await this.updatePersistedProfile((persistedProfile) => BrowserProfileSchema.parse({ ...persistedProfile, nickname: input.nickname.trim(), timeZone: input.timeZone, volumeUnit: input.volumeUnit, dayBoundary: input.dayBoundary }));
          });
        },
      },
      status: { mode: this.mode },
      pass: { state: this.passState },
    };
  };

  getLastImportResult(): RuntimeImportResult | null { return this.lastImportResult ? { ...this.lastImportResult } : null; }

  exportBackupObject(): RuntimeBackup {
    return createRuntimeBackup({ generatedAt: this.dependencies.clock.now(), realm: this.mode, profile: this.profile, events: this.events });
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    this.acceptingMutations = false;
    this.disposing = true;
    const operation = this.disposeOnce();
    this.disposalPromise = operation;
    return operation;
  }

  private async disposeOnce(): Promise<void> {
    const failures: unknown[] = [];
    this.dataGenerationUnsubscribe?.();
    this.dataGenerationUnsubscribe = null;
    this.speechErrorUnsubscribe?.();
    this.speechErrorUnsubscribe = null;
    try { this.dependencies.speech.cancel(); } catch (error) { failures.push(error); }

    if (this.initializationPromise) await Promise.allSettled([this.initializationPromise]);
    await this.mutationTail;

    const closableMetrics = this.dependencies.metrics as MetricsPort & { dispose?: () => void | Promise<void>; close?: () => void | Promise<void> };
    const closableRepository = this.dependencies.repository as EventRepository & { close?: () => void | Promise<void> };
    try { if (closableRepository.close) await closableRepository.close(); } catch (error) { failures.push(error); }
    try {
      if (closableMetrics.dispose) await closableMetrics.dispose();
      else if (closableMetrics.close) await closableMetrics.close();
    } catch (error) { failures.push(error); }
    try { await this.dependencies.onDispose?.(); } catch (error) { failures.push(error); }

    this.listeners.clear();
    this.disposed = true;
    if (failures.length) throw new AggregateError(failures, "Runtime disposal did not complete");
  }
}

export function createExperienceRuntime(dependencies: ExperienceRuntimeDependencies): ExperienceRuntime {
  return new ExperienceRuntime(dependencies);
}

export function profileForRealm(mode: DataRealm, timeZone: string): BrowserProfile {
  return createDefaultProfile(mode, timeZone);
}