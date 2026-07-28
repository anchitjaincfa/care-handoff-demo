import QRCode from "qrcode";
import { CareEventSchema, type CareEvent, type ProposedEvent } from "@/src/domain/types";
import { parseCareEvents } from "@/src/domain/parser";
import { createDemoSeed } from "@/src/domain/demoSeed";
import { createCsvProvenanceZip } from "@/src/domain/exports";
import {
  HANDOFF_ARTIFACT_BOUNDS,
  decodeHandoffFragment,
  encodeHandoffFragment,
  generateHandoffPayload,
  isHandoffExpired,
  summarizeHandoffPayload,
  type HandoffPayload,
  type HandoffTransport,
} from "@/src/domain/handoff";
import type { EventRepository } from "@/src/ports/EventRepository";
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
  OnboardingDraft,
  PassViewerState,
  ProposalViewModel,
  QuickLogKind,
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
export type ManualQuickLogDetails = { food?: string; durationMinutes?: number };
export type RuntimeImportResult = { imported: number; skipped: number };

export type ExperienceRuntimeDependencies = {
  mode: DataRealm;
  repository: EventRepository;
  profileStore: ProfileStore;
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
  requestDeleteConfirmation?: () => string | null;
  requestQuickLogDetails?: (kind: "solids" | "tummy-time") => ManualQuickLogDetails | null | Promise<ManualQuickLogDetails | null>;
  onDispose?: () => void | Promise<void>;
};

type EditableProposal = { value: ProposedEvent; edited: boolean };
type UndoAction = () => Promise<void>;
type CaptureStage = CapturePageProps["stage"];

function safeReason(): string { return "That action could not be completed. Your existing records were left unchanged."; }
function captureError(message = safeReason()): CaptureErrorViewModel { return { title: "Unable to continue", message, recovery: "retry" }; }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }

export function handoffTransportsFor(payload: HandoffPayload, origin: string): { fragment: string; url: string; byteCount: number; qr: boolean; urlTransport: boolean } {
  const fragment = encodeHandoffFragment(payload, "url");
  const url = `${origin.replace(/\/$/, "")}/pass/${fragment}`;
  const byteCount = utf8Bytes(url);
  return { fragment, url, byteCount, qr: byteCount <= HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes, urlTransport: byteCount <= HANDOFF_ARTIFACT_BOUNDS.urlFragmentBytes };
}
function extensionTimestamp(instant: string): string { return instant.replace(/[:.]/g, "-"); }
function clone<T>(value: T): T { return structuredClone(value); }
function isPresent(value: unknown): boolean { return value !== null && value !== undefined && value !== ""; }

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

function passEventRows(payload: HandoffPayload, locale: { locale: string; timeZone: string }): EventRowViewModel[] {
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
  private events: CareEvent[] = [];
  private listeners = new Set<() => void>();
  private initialized = false;
  private terminated = false;
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
  private speechState: SpeechUIState = { status: "probing" };
  private timelineFilter: TimelinePageProps["filter"] = "all";
  private editing: EventEditDraft | null = null;
  private deletingId: string | null = null;
  private handoffBoundary = "8";
  private handoffSummary: ReturnType<typeof summarizeHandoffPayload> | null = null;
  private handoffArtifact: HandoffArtifactState = { status: "idle" };
  private handoffUrl: string | null = null;
  private passState: PassViewerState = { status: "empty" };
  private persistence: StoragePersistenceState = "idle";
  private exportPhase: ActionPhase = "idle";
  private importState: ImportState = { status: "idle" };
  private importCandidate: RuntimeBackup | null = null;
  private wipePhase: ActionPhase = "idle";
  private resetPhase: ActionPhase = "idle";
  private lastImportResult: RuntimeImportResult | null = null;
  private speechErrorUnsubscribe: (() => void) | null = null;
  private disposed = false;

  constructor(private readonly dependencies: ExperienceRuntimeDependencies) {
    if (dependencies.profileStore.realm !== dependencies.mode) throw new Error("Profile store realm does not match runtime mode");
    this.profile = dependencies.profileStore.read();
    this.onboardingDraft = this.draftFromProfile(this.profile);
    const observableSpeech = dependencies.speech as SpeechPort & { setErrorListener?: (listener: (error: SpeechAccessError) => void) => () => void };
    this.speechErrorUnsubscribe = observableSpeech.setErrorListener?.((error) => this.handleSpeechRuntimeError(error)) ?? null;
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
  private async metric(name: MetricName, durationMs?: number): Promise<void> {
    if (this.terminated) return;
    try { await this.dependencies.metrics.record({ name, at: this.dependencies.clock.now(), ...(durationMs === undefined ? {} : { durationMs }) }); } catch { /* Metrics never block care actions. */ }
  }
  private handleSpeechRuntimeError(error: SpeechAccessError): void {
    if (this.terminated || this.disposed) return;
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
  private ensureActive(): void { if (this.terminated) throw new Error("Runtime was terminated after local data deletion"); }
  private async refreshEvents(): Promise<void> {
    this.events = await this.dependencies.repository.list({ householdId: this.profile.householdId, includeDeleted: true });
  }

  async initialize(): Promise<void> {
    this.ensureActive();
    this.profile = this.dependencies.profileStore.read();
    this.onboardingDraft = this.draftFromProfile(this.profile);
    const existing = await this.dependencies.repository.list({ householdId: this.profile.householdId, includeDeleted: true });
    if (this.mode === "demo" && existing.length === 0) {
      const seed = createDemoSeed({ householdId: this.profile.householdId, babyId: this.profile.babyId, timeZone: this.profile.timeZone, anchorInstant: this.dependencies.clock.now() });
      await this.dependencies.repository.import(this.profile.householdId, seed);
    }
    await this.refreshEvents();
    try {
      const storageStatus = await this.dependencies.storage.status();
      this.persistence = storageStatus.persisted ? "granted" : "idle";
    } catch { this.persistence = "unavailable"; }
    await this.probeSpeech(false);
    if (this.dependencies.passFragment) await this.openPass(this.dependencies.passFragment);
    this.initialized = true;
    this.notify();
  }

  private async setAction(work: () => Promise<void>): Promise<void> {
    this.ensureActive();
    this.actionPhase = "pending";
    this.notify();
    try { await work(); this.actionPhase = "success"; }
    catch { this.actionPhase = "error"; }
    this.notify();
  }

  private manualEvent(kind: QuickLogKind, at: string, details: ManualQuickLogDetails | null): CareEvent {
    const base = {
      id: this.dependencies.idFactory?.() ?? defaultId(),
      householdId: this.profile.householdId,
      babyId: this.profile.babyId,
      startedAt: at,
      timeZone: this.profile.timeZone,
      enteredWallClock: this.dependencies.clock.wallClock(at, this.profile.timeZone),
      createdAt: at,
      updatedAt: at,
      deletedAt: null,
      schemaVersion: 1,
      captureMethod: "manual",
      provenance: this.mode,
    } as const;
    if (kind === "bottle") return CareEventSchema.parse({ ...base, type: "feed", endedAt: at, fields: { mode: "bottle" } });
    if (kind === "nursing") return CareEventSchema.parse({ ...base, type: "feed", endedAt: at, fields: { mode: "nursing" } });
    if (kind === "diaper") return CareEventSchema.parse({ ...base, type: "diaper", fields: { kind: "wet" } });
    if (kind === "sleep") return CareEventSchema.parse({ ...base, type: "sleep", endedAt: at, fields: { kind: "unspecified" } });
    if (kind === "pumping") return CareEventSchema.parse({ ...base, type: "pumping", endedAt: at, fields: {} });
    if (kind === "solids") {
      const food = details?.food?.trim();
      if (!food) throw new Error("Solids quick log requires a food description");
      return CareEventSchema.parse({ ...base, type: "solids", fields: { food } });
    }
    const durationMinutes = details?.durationMinutes;
    if (!durationMinutes || !Number.isFinite(durationMinutes) || durationMinutes <= 0) throw new Error("Tummy-time quick log requires a duration");
    return CareEventSchema.parse({ ...base, type: "tummy-time", endedAt: at, fields: { durationMinutes } });
  }

  async quickLog(kind: QuickLogKind): Promise<void> {
    await this.setAction(async () => {
      const details = kind === "solids" || kind === "tummy-time" ? await this.dependencies.requestQuickLogDetails?.(kind) ?? null : null;
      const event = this.manualEvent(kind, this.dependencies.clock.now(), details);
      await this.dependencies.repository.append(event);
      this.undoAction = async () => { await this.dependencies.repository.softDelete(this.profile.householdId, event.id, this.dependencies.clock.now()); };
      await this.refreshEvents();
      await this.metric("capture_manual");
    });
  }

  async startTimer(type: "feed" | "sleep"): Promise<TimerStartOutcome> {
    this.ensureActive();
    const active = this.openTimers()[0];
    if (active) { this.actionPhase = "error"; this.notify(); return { status: "overlap", activeId: active.id }; }
    let outcome: TimerStartOutcome = { status: "error" };
    await this.setAction(async () => {
      const now = this.dependencies.clock.now();
      const base = {
        id: this.dependencies.idFactory?.() ?? defaultId(), householdId: this.profile.householdId, babyId: this.profile.babyId,
        type, startedAt: now, endedAt: null, timeZone: this.profile.timeZone,
        enteredWallClock: this.dependencies.clock.wallClock(now, this.profile.timeZone), createdAt: now, updatedAt: now,
        deletedAt: null, schemaVersion: 1, captureMethod: "manual", provenance: this.mode,
      } as const;
      const event = CareEventSchema.parse(type === "feed" ? { ...base, fields: { mode: "nursing" } } : { ...base, fields: { kind: "unspecified" } });
      await this.dependencies.repository.append(event);
      this.undoAction = async () => { await this.dependencies.repository.softDelete(this.profile.householdId, event.id, this.dependencies.clock.now()); };
      await this.refreshEvents();
      await this.metric("capture_manual");
      outcome = { status: "started", id: event.id };
    });
    return outcome;
  }

  async stopTimer(id: string): Promise<void> {
    await this.setAction(async () => {
      const event = await this.dependencies.repository.get(this.profile.householdId, id);
      if (!event || (event.type !== "feed" && event.type !== "sleep") || event.endedAt !== null || event.deletedAt) throw new Error("Timer is not active");
      const endedAt = this.dependencies.clock.now();
      if (endedAt < event.startedAt) throw new Error("Timer cannot end before it starts");
      await this.dependencies.repository.revise(CareEventSchema.parse({ ...event, endedAt, updatedAt: endedAt }));
      this.undoAction = async () => { await this.dependencies.repository.revise(event); };
      await this.refreshEvents();
    });
  }

  async undo(): Promise<void> {
    const action = this.undoAction;
    if (!action) return;
    await this.setAction(async () => { await action(); this.undoAction = null; await this.refreshEvents(); });
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
    this.ensureActive();
    this.captureStage = "committing";
    this.captureError = null;
    this.notify();
    try {
      if (!this.proposals.length) throw new Error("No proposals to save");
      const now = this.dependencies.clock.now();
      const events = this.proposals.map((proposal) => editableEvent(proposal.value, this.profile, now, this.dependencies.idFactory?.() ?? defaultId(), this.captureOrigin, this.dependencies.clock, this.mode));
      const ids = new Set(events.map((event) => event.id));
      if (ids.size !== events.length) throw new Error("Generated event identifiers were not unique");
      const conflicts = await Promise.all(events.map((event) => this.dependencies.repository.get(this.profile.householdId, event.id)));
      if (conflicts.some(Boolean)) throw new Error("Generated event identifier already exists");
      const result = await this.dependencies.repository.import(this.profile.householdId, events);
      if (result.imported !== events.length || result.skipped !== 0) {
        throw new Error(`The batch changed while saving: ${result.imported} saved and ${result.skipped} skipped. Review the timeline before retrying.`);
      }
      await this.refreshEvents();
      await Promise.all(this.proposals.map((proposal) => this.metric(proposal.edited ? "event_confirmed_edited" : "event_confirmed_unchanged")));
      this.undoAction = async () => { const deletedAt = this.dependencies.clock.now(); await Promise.all(events.map((event) => this.dependencies.repository.softDelete(this.profile.householdId, event.id, deletedAt))); };
      this.captureStage = "committed";
    } catch (error) {
      this.captureStage = "error";
      const message = error instanceof Error && error.message.startsWith("The batch changed while saving:")
        ? error.message
        : "Review every highlighted field. No entries were saved.";
      this.captureError = captureError(message);
    }
    this.notify();
  }

  private resetCapture(): void {
    this.dependencies.speech.cancel();
    this.captureStage = "idle";
    this.captureError = null;
    this.captureSource = "";
    this.captureOrigin = "typed";
    this.proposals = [];
    this.refusals = [];
    this.speechState = { status: "probing" };
    this.notify();
  }

  async probeSpeech(openDisclosure = true): Promise<void> {
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
    const language = "language" in this.speechState ? this.speechState.language : this.profile.locale;
    const locality = "locality" in this.speechState ? this.speechState.locality : this.speechState.status === "disclosure" ? "browser-service" : "browser-service";
    this.captureOrigin = "voice";
    this.speechState = { status: "requesting-permission", locality };
    this.notify();
    try {
      await this.dependencies.speech.start(language, (text) => {
        this.captureSource = `${this.captureSource} ${text}`.trim();
        this.speechState = { status: "listening", locality, interim: "" };
        this.notify();
      }, (interim) => { this.speechState = { status: "listening", locality, interim }; this.notify(); });
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
    this.dependencies.speech.stop();
    if (this.captureSource.trim()) await this.parseCapture();
    else {
      this.captureStage = "error";
      this.captureError = captureError("No speech was transcribed. Try again or type the entry.");
      this.notify();
    }
  }

  private cancelSpeech(): void {
    this.dependencies.speech.cancel();
    this.captureStage = "idle";
    this.captureOrigin = "typed";
    this.speechState = { status: "probing" };
    this.notify();
  }

  private beginEdit(id: string): void {
    const event = this.events.find((candidate) => candidate.id === id && !candidate.deletedAt);
    this.editing = event ? toEditDraft(event) : null;
    this.notify();
  }

  private async saveEdit(): Promise<void> {
    const draft = this.editing;
    if (!draft) return;
    await this.setAction(async () => {
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
      await this.refreshEvents();
    });
  }

  private async confirmDelete(): Promise<void> {
    const id = this.deletingId;
    if (!id) return;
    await this.setAction(async () => {
      await this.dependencies.repository.softDelete(this.profile.householdId, id, this.dependencies.clock.now());
      this.undoAction = async () => { await this.dependencies.repository.restore(this.profile.householdId, id); };
      this.deletingId = null;
      await this.refreshEvents();
    });
  }

  private shiftPayload(): HandoffPayload {
    const now = this.dependencies.clock.now();
    const hours = Number(this.handoffBoundary);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 72) throw new Error("Invalid handoff boundary");
    const shiftStart = new Date(Date.parse(now) - hours * 3_600_000).toISOString();
    return generateHandoffPayload({ events: this.events, provenance: this.mode, generatedAt: now, babyLabel: this.profile.nickname, shiftStart, shiftEnd: now });
  }

  private async generateHandoff(transport: HandoffTransport): Promise<void> {
    this.ensureActive();
    this.handoffArtifact = { status: "preparing" };
    this.notify();
    const limit = transport === "qr" ? HANDOFF_ARTIFACT_BOUNDS.qrFragmentBytes : HANDOFF_ARTIFACT_BOUNDS.urlFragmentBytes;
    try {
      const payload = this.shiftPayload();
      const { fragment, url, byteCount } = handoffTransportsFor(payload, this.dependencies.origin ?? "");
      if (byteCount > limit) {
        this.handoffArtifact = { status: "too-large", byteCount, byteLimit: limit };
        this.notify();
        return;
      }
      const qrDataUrl = transport === "qr" ? await QRCode.toDataURL(url, { width: 320, margin: 1, errorCorrectionLevel: "M" }) : undefined;
      this.handoffSummary = summarizeHandoffPayload(payload);
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
      if (isHandoffExpired(payload, this.dependencies.clock.now())) this.passState = { status: "expired", payload };
      else {
        this.passState = {
          status: "valid",
          payload,
          summary: summarizeHandoffPayload(payload),
          generatedLabel: `Generated ${formatDate(payload.generatedAt, this.locale())}, ${formatTime(payload.generatedAt, this.locale())}`,
          expiryLabel: `Expires ${formatDate(payload.expiresAt, this.locale())}, ${formatTime(payload.expiresAt, this.locale())}`,
          events: passEventRows(payload, this.locale()),
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
        const text = stringifyRuntimeBackup({ generatedAt: now, realm: this.mode, profile: this.profile, events: await this.dependencies.repository.export(this.profile.householdId) });
        download = { name: `nuzzlecue-backup-${extensionTimestamp(now)}.json`, type: "application/json", data: new Blob([text], { type: "application/json" }) };
      } else if (format === "csv") {
        const bytes = createCsvProvenanceZip(await this.dependencies.repository.export(this.profile.householdId), { householdId: this.profile.householdId, generatedAt: now });
        download = { name: `nuzzlecue-events-${extensionTimestamp(now)}.zip`, type: "application/zip", data: new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }) };
      } else {
        download = { name: `nuzzlecue-metrics-${extensionTimestamp(now)}.json`, type: "application/json", data: new Blob([await this.dependencies.metrics.exportJson()], { type: "application/json" }) };
      }
      await this.dependencies.download?.(download);
      await this.metric("export_created");
      this.exportPhase = "success";
    } catch { this.exportPhase = "error"; }
    this.notify();
  }

  private chooseImport(candidate: ImportCandidate): void {
    this.importState = { status: "reading", fileName: candidate.name };
    this.importCandidate = null;
    this.notify();
    try {
      const backup = parseRuntimeBackup(candidate.text, this.mode);
      this.importCandidate = backup;
      const deleted = backup.events.filter((event) => event.deletedAt).length;
      this.importState = { status: "review", fileName: candidate.name, eventCount: backup.events.length, warnings: deleted ? [`${deleted} soft-deleted records are included for faithful restore.`] : [] };
    } catch { this.importState = { status: "error", reason: "The selected file is not a valid backup for this data mode." }; }
    this.notify();
  }

  private async confirmImport(): Promise<void> {
    const backup = this.importCandidate;
    if (!backup || this.importState.status !== "review") return;
    const fileName = this.importState.fileName;
    this.importState = { status: "importing", fileName };
    this.notify();
    try {
      const result = await this.dependencies.repository.import(backup.profile.householdId, backup.events);
      this.lastImportResult = { imported: result.imported, skipped: result.skipped };
      this.dependencies.profileStore.write(backup.profile);
      this.profile = clone(backup.profile);
      this.onboardingDraft = this.draftFromProfile(this.profile);
      await this.refreshEvents();
      this.importCandidate = null;
      this.importState = result.skipped === 0
        ? { status: "success", importedCount: result.imported }
        : { status: "error", reason: `Imported ${result.imported} records and skipped ${result.skipped} existing records.` };
    } catch { this.importState = { status: "error", reason: "Import failed before the backup could be activated." }; }
    this.notify();
  }

  async wipe(confirmation: string): Promise<boolean> {
    this.ensureActive();
    if (confirmation !== "DELETE") { this.wipePhase = "error"; this.notify(); return false; }
    this.wipePhase = "pending";
    this.notify();
    try {
      await this.metric("delete_all_completed");
      this.dependencies.clearAllProfiles?.();
      this.dependencies.profileStore.clear();
      await this.dependencies.deleteAllData?.();
      this.events = [];
      this.undoAction = null;
      this.terminated = true;
      this.wipePhase = "success";
      this.notify();
      return true;
    } catch { this.wipePhase = "error"; this.notify(); return false; }
  }

  private async resetDemo(): Promise<void> {
    if (this.mode !== "demo") return;
    this.resetPhase = "pending";
    this.notify();
    try {
      await this.dependencies.repository.purgeAll(this.profile.householdId);
      const seed = createDemoSeed({ householdId: this.profile.householdId, babyId: this.profile.babyId, timeZone: this.profile.timeZone, anchorInstant: this.dependencies.clock.now() });
      await this.dependencies.repository.import(this.profile.householdId, seed);
      await this.refreshEvents();
      this.undoAction = null;
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
      quickActions: ["bottle", "nursing", "diaper", "sleep", "pumping", "solids", "tummy-time"] as const,
      activeTimers,
      recentEvents: recent.map((event) => toEventRow(event, locale)),
      canUndo: Boolean(this.undoAction),
      phase: this.actionPhase,
      onQuickLog: (kind: QuickLogKind) => this.quickLog(kind),
      onStartTimer: async (type: "feed" | "sleep") => { await this.startTimer(type); },
      onStopTimer: (id: string) => this.stopTimer(id),
      onUndo: () => this.undo(),
    };
    const captureBase = {
      sourceText: this.captureSource,
      speech: this.speechState,
      proposals: this.proposals.map(proposalView),
      refusals: this.refusals,
      onSourceTextChange: (value: string) => { this.captureSource = value; this.captureOrigin = "typed"; this.notify(); },
      onParse: () => this.parseCapture(),
      onProbeSpeech: () => this.probeSpeech(),
      onAcceptSpeechDisclosure: () => this.acceptSpeech(),
      onStopSpeech: () => this.stopSpeech(),
      onCancelSpeech: () => this.cancelSpeech(),
      onCorrect: (clientId: string, path: string, value: string | number | null) => this.correctProposal(clientId, path, value),
      onConfirm: () => this.confirmCapture(),
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
      onFilterChange: (filter: TimelinePageProps["filter"]) => { this.timelineFilter = filter; this.notify(); },
      onEdit: (id: string) => this.beginEdit(id),
      onEditChange: (fields: EventEditDraft["fields"]) => { if (this.editing) this.editing = { ...this.editing, fields }; this.notify(); },
      onSaveEdit: () => this.saveEdit(),
      onCancelEdit: () => { this.editing = null; this.notify(); },
      onDelete: (id: string) => { this.deletingId = id; this.notify(); },
      onConfirmDelete: () => this.confirmDelete(),
      onUndo: () => this.undo(),
    } satisfies TimelinePageProps;
    const handoffRecent = (() => { try { const payload = this.shiftPayload(); const included = new Set(payload.events.map((event) => `${event.type}:${event.at}`)); return recent.filter((event) => included.has(`${event.type}:${event.startedAt}`)).map((event) => toEventRow(event, locale)); } catch { return []; } })();
    return {
      mode: this.mode,
      home: { mode: this.mode },
      onboarding: {
        step: this.onboardingStep,
        draft: this.onboardingDraft,
        availableTimeZones: this.availableTimeZones(),
        phase: this.onboardingPhase,
        onChange: (key, value) => { this.onboardingDraft = { ...this.onboardingDraft, [key]: value }; this.notify(); },
        onToggleTracking: (type) => { const tracked = this.onboardingDraft.tracked.includes(type) ? this.onboardingDraft.tracked.filter((candidate) => candidate !== type) : [...this.onboardingDraft.tracked, type]; this.onboardingDraft = { ...this.onboardingDraft, tracked }; this.notify(); },
        onBack: () => { this.onboardingStep = Math.max(1, this.onboardingStep - 1) as 1 | 2 | 3; this.notify(); },
        onNext: () => { this.onboardingStep = Math.min(3, this.onboardingStep + 1) as 1 | 2 | 3; this.notify(); },
        onComplete: async () => {
          this.onboardingPhase = "pending"; this.notify();
          try {
            this.dependencies.clock.wallClock(this.dependencies.clock.now(), this.onboardingDraft.timeZone);
            this.profile = BrowserProfileSchema.parse({ ...this.profile, nickname: this.onboardingDraft.babyLabel.trim(), timeZone: this.onboardingDraft.timeZone, locale: this.onboardingDraft.locale, volumeUnit: this.onboardingDraft.volumeUnit, tracked: [...this.onboardingDraft.tracked], onboardingComplete: true });
            this.dependencies.profileStore.write(this.profile);
            await this.metric("onboarding_completed");
            this.onboardingPhase = "success";
          } catch { this.onboardingPhase = "error"; }
          this.notify();
        },
      },
      today,
      demo: { today, resetPhase: this.resetPhase, onReset: () => this.resetDemo() },
      capture,
      timeline,
      insights: buildInsightsView(active, now, this.mode, locale),
      handoff: {
        mode: this.mode,
        boundary: this.handoffBoundary,
        boundaryOptions: [{ label: "Past 4 hours", value: "4" }, { label: "Past 8 hours", value: "8" }, { label: "Past 12 hours", value: "12" }, { label: "Past 24 hours", value: "24" }],
        summary: this.handoffSummary,
        recentEvents: handoffRecent,
        artifact: this.handoffArtifact,
        onBoundaryChange: (value: string) => { this.handoffBoundary = value; this.handoffArtifact = { status: "idle" }; this.handoffSummary = null; this.notify(); },
        onGenerate: (transport: HandoffTransport) => this.generateHandoff(transport),
        onCopyLink: async () => { if (this.handoffUrl) await this.dependencies.copyText?.(this.handoffUrl); },
        onReset: () => { this.handoffArtifact = { status: "idle" }; this.handoffSummary = null; this.handoffUrl = null; this.notify(); },
      },
      privacy: {
        storage: this.persistence,
        exportPhase: this.exportPhase,
        importState: this.importState,
        wipePhase: this.wipePhase,
        onRequestPersistence: async () => { this.persistence = "requesting"; this.notify(); try { this.persistence = await this.dependencies.storage.requestPersistence() ? "granted" : "denied"; } catch { this.persistence = "unavailable"; } this.notify(); },
        onExport: (format) => this.exportData(format),
        onChooseImport: (candidate) => this.chooseImport(candidate),
        onConfirmImport: () => this.confirmImport(),
        onCancelImport: () => { this.importCandidate = null; this.importState = { status: "idle" }; this.notify(); },
        onWipe: async () => { const confirmation = this.dependencies.requestDeleteConfirmation?.() ?? null; if (confirmation !== null) await this.wipe(confirmation); },
      },
      settings: {
        preferences: this.profile.preferences,
        profile: { nickname: this.profile.nickname, timeZone: this.profile.timeZone, volumeUnit: this.profile.volumeUnit, dayBoundary: this.profile.dayBoundary },
        availableTimeZones: this.availableTimeZones(),
        phase: this.actionPhase,
        onPreferenceChange: (key, value) => { this.profile = BrowserProfileSchema.parse({ ...this.profile, preferences: { ...this.profile.preferences, [key]: value } }); this.dependencies.profileStore.write(this.profile); this.notify(); },
        onProfileSave: async (input) => {
          await this.setAction(async () => {
            this.dependencies.clock.wallClock(this.dependencies.clock.now(), input.timeZone);
            this.profile = BrowserProfileSchema.parse({ ...this.profile, nickname: input.nickname.trim(), timeZone: input.timeZone, volumeUnit: input.volumeUnit, dayBoundary: input.dayBoundary });
            this.dependencies.profileStore.write(this.profile);
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

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.speechErrorUnsubscribe?.();
    this.speechErrorUnsubscribe = null;
    this.dependencies.speech.cancel();
    const closableMetrics = this.dependencies.metrics as MetricsPort & { dispose?: () => void | Promise<void>; close?: () => void | Promise<void> };
    const closableRepository = this.dependencies.repository as EventRepository & { close?: () => void | Promise<void> };
    if (closableRepository.close) await closableRepository.close();
    if (closableMetrics.dispose) await closableMetrics.dispose();
    else if (closableMetrics.close) await closableMetrics.close();
    await this.dependencies.onDispose?.();
    this.listeners.clear();
  }
}

export function createExperienceRuntime(dependencies: ExperienceRuntimeDependencies): ExperienceRuntime {
  return new ExperienceRuntime(dependencies);
}

export function profileForRealm(mode: DataRealm, timeZone: string): BrowserProfile {
  return createDefaultProfile(mode, timeZone);
}