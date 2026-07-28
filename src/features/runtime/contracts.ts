import type { HandoffPayload, HandoffTransport } from "@/src/domain/handoff";
import type { EventType } from "@/src/domain/types";

export type ExperienceMode = "real" | "demo";
export type ActionPhase = "idle" | "pending" | "success" | "error";
export type ControllerAction = void | Promise<void>;

export type OnboardingDraft = {
  babyLabel: string;
  timeZone: string;
  locale: string;
  volumeUnit: "oz" | "ml";
  tracked: readonly EventType[];
};

export type OnboardingPageProps = {
  step: 1 | 2 | 3;
  draft: OnboardingDraft;
  availableTimeZones: readonly string[];
  phase: ActionPhase;
  onChange<K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]): ControllerAction;
  onToggleTracking(type: EventType): ControllerAction;
  onBack(): ControllerAction;
  onNext(): ControllerAction;
  onComplete(): ControllerAction;
};

export type QuickLogKind =
  | "bottle"
  | "nursing"
  | "diaper"
  | "sleep"
  | "pumping"
  | "solids"
  | "tummy-time";

export type ActiveTimerViewModel = {
  id: string;
  type: "feed" | "sleep";
  title: string;
  startedAtEpochMs: number;
  startedLabel: string;
  /**
   * A controller-formatted initial value. Interactive views derive subsequent
   * elapsed labels from startedAtEpochMs on a one-second cadence while visible.
   */
  elapsedLabel: string;
  pending: boolean;
};

export type EventRowViewModel = {
  id: string;
  type: EventType;
  timeLabel: string;
  title: string;
  detail: string;
  canEdit: boolean;
  canDelete: boolean;
};

export type TodayPageProps = {
  mode: ExperienceMode;
  title: string;
  dateLabel: string;
  dayBoundaryLabel: string;
  quickActions: readonly QuickLogKind[];
  activeTimers: readonly ActiveTimerViewModel[];
  recentEvents: readonly EventRowViewModel[];
  canUndo: boolean;
  phase: ActionPhase;
  onQuickLog(kind: QuickLogKind): ControllerAction;
  onStartTimer(type: ActiveTimerViewModel["type"]): ControllerAction;
  onStopTimer(id: string): ControllerAction;
  onUndo(): ControllerAction;
};

export type SpeechUIState =
  | { status: "probing" }
  | { status: "unavailable"; reason: string }
  | { status: "disclosure"; service: "browser-service"; language: string }
  | { status: "ready"; locality: "local-confirmed" | "browser-service"; language: string }
  | { status: "requesting-permission"; locality: "local-confirmed" | "browser-service" }
  | { status: "listening"; locality: "local-confirmed" | "browser-service"; interim: string }
  | { status: "denied"; reason: string }
  | { status: "error"; reason: string };

export type ReviewFieldViewModel = {
  path: string;
  label: string;
  value: string | number | null;
  control: "text" | "number" | "select" | "time";
  options?: readonly { label: string; value: string }[];
  confidence: number;
  assumption?: string;
  error?: string;
};

export type ProposalViewModel = {
  clientId: string;
  type: "feed" | "sleep" | "diaper";
  title: string;
  confidence: number;
  unresolved: readonly string[];
  fields: readonly ReviewFieldViewModel[];
};

export type RefusalViewModel = {
  clientId: string;
  sourceText: string;
  reason: "unsupported" | "ambiguous" | "unsafe" | "empty";
  explanation: string;
};

export type CaptureErrorViewModel = {
  title: string;
  message: string;
  recovery: "retry" | "reset";
};

type CapturePageBaseProps = {
  sourceText: string;
  speech: SpeechUIState;
  proposals: readonly ProposalViewModel[];
  refusals: readonly RefusalViewModel[];
  onSourceTextChange(value: string): ControllerAction;
  onParse(): ControllerAction;
  onProbeSpeech(): ControllerAction;
  onAcceptSpeechDisclosure(): ControllerAction;
  onStopSpeech(): ControllerAction;
  onCancelSpeech(): ControllerAction;
  onCorrect(clientId: string, path: string, value: string | number | null): ControllerAction;
  onConfirm(): ControllerAction;
  onReset(): ControllerAction;
};

export type CapturePageProps = CapturePageBaseProps & (
  | {
      stage: "idle" | "speech-disclosure" | "listening" | "review" | "committing" | "committed";
      error: null;
    }
  | { stage: "error"; error: CaptureErrorViewModel }
);

export type EventEditDraft = {
  id: string;
  fields: Readonly<Record<string, string | number | null>>;
};

export type TimelineGroupViewModel = {
  id: string;
  heading: string;
  events: readonly EventRowViewModel[];
};

export type TimelinePageProps = {
  filter: "all" | EventType;
  groups: readonly TimelineGroupViewModel[];
  editing: EventEditDraft | null;
  deletingId: string | null;
  canUndo: boolean;
  phase: ActionPhase;
  onFilterChange(filter: TimelinePageProps["filter"]): ControllerAction;
  onEdit(id: string): ControllerAction;
  onEditChange(fields: EventEditDraft["fields"]): ControllerAction;
  onSaveEdit(): ControllerAction;
  onCancelEdit(): ControllerAction;
  onDelete(id: string): ControllerAction;
  onConfirmDelete(): ControllerAction;
  onUndo(): ControllerAction;
};

export type InsightEvidenceViewModel = {
  sampleCount: number;
  requiredSamples: number;
  freshnessLabel?: string;
  stale: boolean;
};

export type RoutineWindowViewModel =
  | { status: "forming"; description: string; evidence: InsightEvidenceViewModel }
  | {
      status: "ready";
      description: string;
      evidence: InsightEvidenceViewModel;
      lowerLabel: string;
      medianLabel: string;
      upperLabel: string;
    };

export type NextEventWindowViewModel =
  | { status: "forming"; description: string; evidence: InsightEvidenceViewModel }
  | {
      status: "ready";
      description: string;
      evidence: InsightEvidenceViewModel;
      windowStartLabel: string;
      midpointLabel: string;
      windowEndLabel: string;
      medianIntervalLabel: string;
    };

export type InsightsPageProps = {
  mode: ExperienceMode;
  summary: { feeds: number; sleepMinutes: number; diapers: number; rangeLabel: string };
  /**
   * Controllers map domain insight unions into presentation-safe labels so views
   * never interpret time zones, instants, or statistical minute values.
   */
  routine: RoutineWindowViewModel;
  nextEvent: NextEventWindowViewModel;
  generatedLabel: string;
};

export type HandoffSummaryViewModel = {
  feeds: number;
  diapers: number;
  sleepMinutes: number;
  openTimers: number;
};

export type HandoffArtifactState =
  | { status: "idle" }
  | { status: "preparing" }
  | {
      status: "ready";
      transport: HandoffTransport;
      fragment: string;
      qrDataUrl?: string;
      byteCount: number;
      byteLimit: number;
      expiryLabel: string;
    }
  | { status: "too-large"; byteCount: number; byteLimit: number }
  | { status: "error"; reason: string };

export type HandoffPageProps = {
  mode: ExperienceMode;
  boundary: string;
  boundaryOptions: readonly { label: string; value: string }[];
  summary: HandoffSummaryViewModel | null;
  recentEvents: readonly EventRowViewModel[];
  artifact: HandoffArtifactState;
  onBoundaryChange(value: string): ControllerAction;
  onGenerate(transport: HandoffTransport): ControllerAction;
  onCopyLink(): ControllerAction;
  onReset(): ControllerAction;
};

export type PassViewerState =
  | { status: "empty" }
  | { status: "invalid"; reason: string }
  | { status: "expired"; payload: HandoffPayload }
  | {
      status: "valid";
      payload: HandoffPayload;
      summary: HandoffSummaryViewModel;
      generatedLabel: string;
      expiryLabel: string;
      events: readonly EventRowViewModel[];
    };

export type PassViewerPageProps = {
  state: PassViewerState;
};

export type StoragePersistenceState = "idle" | "requesting" | "granted" | "denied" | "unavailable";
export type ImportState =
  | { status: "idle" }
  | { status: "reading"; fileName: string }
  | { status: "review"; fileName: string; eventCount: number; warnings: readonly string[] }
  | { status: "importing"; fileName: string }
  | { status: "success"; importedCount: number }
  | { status: "error"; reason: string };

export type ImportCandidate = {
  name: string;
  text: string;
};

export type PrivacyPageProps = {
  storage: StoragePersistenceState;
  exportPhase: ActionPhase;
  importState: ImportState;
  wipePhase: ActionPhase;
  onRequestPersistence(): ControllerAction;
  onExport(format: "json" | "csv" | "metrics-json"): ControllerAction;
  onChooseImport(candidate: ImportCandidate): ControllerAction;
  onConfirmImport(): ControllerAction;
  onCancelImport(): ControllerAction;
  onWipe(confirmation: string): ControllerAction;
};

export type PreferencesSnapshot = {
  nursery: boolean;
  reducedMotion: boolean;
};

export type SettingsProfile = {
  nickname: string;
  timeZone: string;
  volumeUnit: "oz" | "ml";
  dayBoundary: string;
};

export type SettingsPageProps = {
  preferences: PreferencesSnapshot;
  profile: SettingsProfile;
  availableTimeZones: readonly string[];
  phase: ActionPhase;
  onPreferenceChange<K extends keyof PreferencesSnapshot>(key: K, value: PreferencesSnapshot[K]): ControllerAction;
  onProfileSave(input: SettingsProfile): ControllerAction;
};

export type DemoPageProps = {
  today: TodayPageProps;
  resetPhase: ActionPhase;
  onReset(): ControllerAction;
};

export type HomePageProps = { mode: ExperienceMode };
export type StatusPageProps = { mode: ExperienceMode };

export type ExperienceControllerSet = {
  mode: ExperienceMode;
  home: HomePageProps;
  onboarding: OnboardingPageProps;
  today: TodayPageProps;
  demo: DemoPageProps;
  capture: CapturePageProps;
  timeline: TimelinePageProps;
  insights: InsightsPageProps;
  handoff: HandoffPageProps;
  privacy: PrivacyPageProps;
  settings: SettingsPageProps;
  status: StatusPageProps;
  pass: PassViewerPageProps;
};
