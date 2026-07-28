import { describe, expect, it } from "vitest";
import type {
  CapturePageProps,
  ExperienceControllerSet,
  TodayPageProps,
} from "@/src/features/runtime/contracts";

const noop = () => undefined;

const todayController = {
  mode: "demo",
  title: "Today",
  dateLabel: "Sample day",
  dayBoundaryLabel: "4:00 AM",
  volumeUnit: "oz",
  quickActions: [],
  activeTimers: [],
  recentEvents: [],
  canUndo: false,
  phase: "idle",
  onQuickLog: noop,
  onStartTimer: noop,
  onStopTimer: noop,
  onUndo: noop,
} satisfies TodayPageProps;

const captureErrorController = {
  stage: "error",
  error: {
    title: "Could not review this entry",
    message: "Try again or reset the draft.",
    recovery: "retry",
  },
  sourceText: "",
  speech: { status: "unavailable", reason: "Fixture has no speech service." },
  proposals: [],
  refusals: [],
  onSourceTextChange: noop,
  onParse: noop,
  onProbeSpeech: noop,
  onAcceptSpeechDisclosure: noop,
  onStopSpeech: noop,
  onCancelSpeech: noop,
  onCorrect: noop,
  onConfirm: noop,
  onReset: noop,
} satisfies CapturePageProps;

const controllerFixture = {
  mode: "demo",
  home: { mode: "demo" },
  onboarding: {
    step: 1,
    draft: {
      babyLabel: "J",
      timeZone: "America/Los_Angeles",
      locale: "en-US",
      volumeUnit: "oz",
      tracked: ["feed", "sleep", "diaper"],
    },
    availableTimeZones: ["America/Los_Angeles"],
    phase: "idle",
    onChange: noop,
    onToggleTracking: noop,
    onBack: noop,
    onNext: noop,
    onComplete: noop,
  },
  today: todayController,
  demo: { today: todayController, resetPhase: "idle", onReset: noop },
  capture: captureErrorController,
  timeline: {
    filter: "all",
    groups: [],
    editing: null,
    deletingId: null,
    canUndo: false,
    phase: "idle",
    onFilterChange: noop,
    onEdit: noop,
    onEditChange: noop,
    onSaveEdit: noop,
    onCancelEdit: noop,
    onDelete: noop,
    onConfirmDelete: noop,
    onUndo: noop,
  },
  insights: {
    mode: "demo",
    summary: { feeds: 0, sleepMinutes: 0, diapers: 0, rangeLabel: "Sample week" },
    routine: {
      status: "forming",
      description: "Patterns are still forming.",
      evidence: { sampleCount: 0, requiredSamples: 5, stale: false },
    },
    nextEvent: {
      status: "forming",
      description: "Patterns are still forming.",
      evidence: { sampleCount: 0, requiredSamples: 5, stale: false },
    },
    generatedLabel: "Generated from sample records",
  },
  handoff: {
    mode: "demo",
    boundary: "08:00",
    boundaryOptions: [],
    summary: null,
    recentEvents: [],
    artifact: { status: "idle" },
    onBoundaryChange: noop,
    onGenerate: noop,
    onCopyLink: noop,
    onReset: noop,
  },
  privacy: {
    mode: "demo",
    storage: "idle",
    storageEstimate: {},
    exportPhase: "idle",
    importState: { status: "idle" },
    wipePhase: "idle",
    onRequestPersistence: noop,
    onExport: noop,
    onChooseImport: noop,
    onConfirmImport: noop,
    onCancelImport: noop,
    onWipe: noop,
  },
  settings: {
    preferences: { nursery: false, reducedMotion: false },
    profile: {
      nickname: "J",
      timeZone: "America/Los_Angeles",
      volumeUnit: "oz",
      dayBoundary: "04:00",
    },
    availableTimeZones: ["America/Los_Angeles"],
    phase: "idle",
    onPreferenceChange: noop,
    onProfileSave: noop,
  },
  status: { mode: "demo" },
  pass: { state: { status: "empty" } },
} satisfies ExperienceControllerSet;

describe("experience controller contract", () => {
  it("has a compile-time conforming complete controller fixture", () => {
    expect(controllerFixture.mode).toBe("demo");
    expect(controllerFixture.capture.error.recovery).toBe("retry");
  });
});
