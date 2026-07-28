import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COPY } from "@/src/copy";
import { ExperienceApp } from "@/src/features/ExperienceApp";
import { CaptureView } from "@/src/features/capture/CapturePage";
import { DemoView } from "@/src/features/demo/DemoPage";
import { HandoffView } from "@/src/features/handoff/HandoffPage";
import { PassViewerView } from "@/src/features/handoff/PassViewerPage";
import { InsightsView } from "@/src/features/insights/InsightsPage";
import { SettingsView } from "@/src/features/preferences/Preferences";
import { PrivacyView } from "@/src/features/privacy/PrivacyPage";
import { ExperienceViews } from "@/src/features/runtime/ExperienceViews";
import { ConfirmDialog } from "@/src/features/shared/ExperiencePrimitives";
import type { CapturePageProps, PrivacyPageProps, TodayPageProps } from "@/src/features/runtime/contracts";
import { TimelineView } from "@/src/features/timeline/TimelinePage";
import { TodayView } from "@/src/features/today/TodayPage";

afterEach(cleanup);

const today = (overrides: Partial<TodayPageProps> = {}): TodayPageProps => ({
  mode: "real",
  title: "Today",
  dateLabel: "Monday",
  dayBoundaryLabel: "7:00 AM boundary",
  quickActions: ["bottle"],
  activeTimers: [],
  recentEvents: [],
  canUndo: false,
  phase: "idle",
  onQuickLog: vi.fn(),
  onStartTimer: vi.fn(),
  onStopTimer: vi.fn(),
  onUndo: vi.fn(),
  ...overrides,

});

const capture = (overrides: Partial<CapturePageProps> = {}): CapturePageProps => ({
  stage: "idle",
  error: null,
  sourceText: "",
  speech: { status: "unavailable", reason: "Not supported" },
  proposals: [],
  refusals: [],
  onSourceTextChange: vi.fn(),
  onParse: vi.fn(),
  onProbeSpeech: vi.fn(),
  onAcceptSpeechDisclosure: vi.fn(),
  onStopSpeech: vi.fn(),
  onCancelSpeech: vi.fn(),
  onCorrect: vi.fn(),
  onConfirm: vi.fn(),
  onReset: vi.fn(),
  ...overrides,
} as CapturePageProps);

const privacy = (overrides: Partial<PrivacyPageProps> = {}): PrivacyPageProps => ({
  storage: "idle",
  storageEstimate: {},
  exportPhase: "idle",
  importState: { status: "idle" },
  wipePhase: "idle",
  onRequestPersistence: vi.fn(),
  onExport: vi.fn(),
  onChooseImport: vi.fn(),
  onConfirmImport: vi.fn(),
  onCancelImport: vi.fn(),
  onWipe: vi.fn(),
  ...overrides,
});

describe("controller-driven experience views", () => {
  it("exports one renderer for every experience controller", () => {
    expect(Object.keys(ExperienceViews).sort()).toEqual(["capture", "demo", "handoff", "home", "insights", "onboarding", "pass", "privacy", "settings", "status", "timeline", "today"]);
  });

  it("reviews a quick log before dispatching its controller action", () => {
    const onQuickLog = vi.fn();
    render(<TodayView {...today({ onQuickLog })} />);
    fireEvent.click(screen.getByRole("button", { name: /Bottle/ }));
    expect(onQuickLog).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: COPY.live.quickReviewTitle })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: COPY.live.quickConfirm }));
    expect(onQuickLog).toHaveBeenCalledWith("bottle");
  });

  it("renders active timer state and dispatches stop", () => {
    const onStopTimer = vi.fn();
    render(<TodayView {...today({ onStopTimer, activeTimers: [{ id: "timer-1", type: "sleep", title: "Sleep", startedAtEpochMs: Date.now() - 60_000, startedLabel: "Started", elapsedLabel: "1:00", pending: false }] })} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.live.timerStop }));
    expect(onStopTimer).toHaveBeenCalledWith("timer-1");
  });

  it("keeps speech disclosure explicit and cancellable", () => {
    const onCancelSpeech = vi.fn();
    render(<CaptureView {...capture({ stage: "speech-disclosure", speech: { status: "disclosure", service: "browser-service", language: "en-US" }, onCancelSpeech })} />);
    expect(screen.getByRole("dialog", { name: COPY.capture.disclosureTitle })).toHaveAttribute("aria-modal", "true");
    fireEvent.click(screen.getByRole("button", { name: COPY.live.speechCancel }));
    expect(onCancelSpeech).toHaveBeenCalledOnce();
  });

  it("shows refusals and editable proposals without fabricating a save", () => {
    const onCorrect = vi.fn();
    const onConfirm = vi.fn();
    render(<CaptureView {...capture({
      stage: "review",
      sourceText: "care note",
      speech: { status: "unavailable", reason: "No speech" },
      refusals: [{ clientId: "refused-1", sourceText: "unknown", reason: "ambiguous", explanation: "Needs a clearer time." }],
      proposals: [{ clientId: "proposal-1", type: "feed", title: "Bottle", confidence: 0.7, unresolved: ["amount"], fields: [{ path: "amount", label: "Amount", value: 2, control: "number", confidence: 0.7 }] }],
      onCorrect,
      onConfirm,
    })} />);
    expect(screen.getByRole("alert")).toHaveTextContent(COPY.live.parseRefused);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Amount" }), { target: { value: "3" } });
    expect(onCorrect).toHaveBeenCalledWith("proposal-1", "amount", 3);
    fireEvent.click(screen.getByRole("button", { name: COPY.live.confirmEntries }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("requires exact DELETE before invoking wipe", () => {
    const onWipe = vi.fn();
    render(<PrivacyView {...privacy({ onWipe })} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.live.deleteForever }));
    const confirm = screen.getAllByRole("button", { name: COPY.live.deleteForever }).at(-1)!;
    fireEvent.change(screen.getByRole("textbox", { name: COPY.live.deleteInstruction }), { target: { value: "delete" } });
    fireEvent.click(confirm);
    expect(onWipe).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: COPY.live.deleteInstruction }), { target: { value: COPY.privacy.confirmWord } });
    fireEvent.click(confirm);
    expect(onWipe).toHaveBeenCalledOnce();
    expect(onWipe).toHaveBeenCalledWith(COPY.privacy.confirmWord);
  });

  it.each(["empty", "invalid", "expired"] as const)("renders the %s pass state without valid details", (status) => {
    const expiredPayload = { v: 1 as const, provenance: "demo" as const, generatedAt: "2026-07-27T00:00:00.000Z", expiresAt: "2026-07-27T12:00:00.000Z", babyLabel: "Mira", shiftStart: "2026-07-27T00:00:00.000Z", shiftEnd: "2026-07-27T01:00:00.000Z", events: [], openTimerCount: 0 };
    const state = status === "empty" ? { status } as const : status === "invalid" ? { status, reason: "Changed" } as const : { status, payload: expiredPayload } as const;
    render(<PassViewerView state={state} />);
    expect(screen.queryByText(COPY.live.passEvents)).not.toBeInTheDocument();
  });

  it("keeps every demo navigation target in the demo realm or exits to home", () => {
    render(<ExperienceApp page="demo" />);
    const unsafe = screen.getAllByRole("link").filter((link) => {
      const href = link.getAttribute("href") || "";
      return ["/today/", "/capture/", "/timeline/", "/insights/", "/handoff/", "/privacy/", "/settings/"].includes(href);
    });
    expect(unsafe).toEqual([]);
  });
  it("labels seeded demo data as isolated rather than as a preview controller", () => {
    render(<DemoView today={today({ mode: "demo" })} resetPhase="idle" onReset={vi.fn()} />);
    expect(screen.getByText(COPY.live.demoIsolation)).toBeInTheDocument();
    expect(screen.queryByText(COPY.live.previewController)).not.toBeInTheDocument();
    expect(screen.queryByText(COPY.global.preview)).not.toBeInTheDocument();
  });

  it("labels an unavailable date explicitly", () => {
    render(<TodayView {...today({ dateLabel: "" })} />);
    expect(screen.getByText(COPY.live.dateUnavailable)).toBeInTheDocument();
  });

  it("shows a freshness label without calling fresh evidence stale", () => {
    render(<InsightsView
      mode="real"
      summary={{ feeds: 2, sleepMinutes: 30, diapers: 1, rangeLabel: "This week" }}
      routine={{ status: "forming", description: "Routine forming", evidence: { sampleCount: 2, requiredSamples: 5, freshnessLabel: "Updated today", stale: false } }}
      nextEvent={{ status: "forming", description: "Next event forming", evidence: { sampleCount: 2, requiredSamples: 5, freshnessLabel: "Updated today", stale: false } }}
      generatedLabel="Generated today"
    />);
    expect(screen.queryByText(COPY.live.staleEvidence)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Updated today/).length).toBeGreaterThan(0);
  });

  it("warns only when controller evidence is explicitly stale", () => {
    render(<InsightsView
      mode="real"
      summary={{ feeds: 2, sleepMinutes: 30, diapers: 1, rangeLabel: "This week" }}
      routine={{ status: "forming", description: "Routine forming", evidence: { sampleCount: 2, requiredSamples: 5, freshnessLabel: "Updated four days ago", stale: true } }}
      nextEvent={{ status: "forming", description: "Next event forming", evidence: { sampleCount: 2, requiredSamples: 5, stale: false } }}
      generatedLabel="Generated earlier"
    />);
    expect(screen.getByText(COPY.live.staleEvidence)).toBeInTheDocument();
  });

  it("renders controller-provided timezones, preserves the current zone, and resyncs a new profile", () => {
    const base = {
      preferences: { nursery: false, reducedMotion: false },
      phase: "idle" as const,
      onPreferenceChange: vi.fn(),
      onProfileSave: vi.fn(),
    };
    const { rerender } = render(<SettingsView {...base} profile={{ nickname: "J", timeZone: "Asia/Kathmandu", volumeUnit: "ml", dayBoundary: "04:00" }} availableTimeZones={["UTC"]} />);
    const zone = screen.getByRole("combobox", { name: COPY.settings.timezone }) as HTMLSelectElement;
    expect(zone.value).toBe("Asia/Kathmandu");
    expect(screen.getByRole("option", { name: "Asia/Kathmandu" })).toBeInTheDocument();
    rerender(<SettingsView {...base} profile={{ nickname: "M", timeZone: "Europe/Berlin", volumeUnit: "oz", dayBoundary: "05:00" }} availableTimeZones={["Europe/Paris"]} />);
    expect((screen.getByRole("combobox", { name: COPY.settings.timezone }) as HTMLSelectElement).value).toBe("Europe/Berlin");
    expect((screen.getByRole("textbox", { name: COPY.settings.nickname }) as HTMLInputElement).value).toBe("M");
  });

  it("renders valid pass controller labels and formatted events without raw payload timestamps or types", () => {
    const rawGenerated = "2026-07-27T00:00:00.000Z";
    const rawExpiry = "2026-07-27T12:00:00.000Z";
    render(<PassViewerView state={{
      status: "valid",
      payload: {
        v: 1,
        provenance: "real",
        generatedAt: rawGenerated,
        expiresAt: rawExpiry,
        babyLabel: "Mira",
        shiftStart: "2026-07-27T00:00:00.000Z",
        shiftEnd: "2026-07-27T01:00:00.000Z",
        events: [{ type: "feed", at: "2026-07-27T00:20:00.000Z", details: { mode: "bottle", volume: 3, unit: "oz" } }],
        openTimerCount: 0,
      },
      summary: { feeds: 1, diapers: 0, sleepMinutes: 30, openTimers: 0 },
      generatedLabel: "Generated just now",
      expiryLabel: "Expires in 12 hours",
      events: [{ id: "event-1", type: "feed", timeLabel: "8:20 AM", title: "Bottle", detail: "3 oz", canEdit: false, canDelete: false }],
    }} />);
    expect(screen.getByText(COPY.global.sharedCopy)).toBeInTheDocument();
    expect(screen.queryByText(COPY.global.live)).not.toBeInTheDocument();
    expect(screen.getByText(COPY.live.feedsStat)).toBeInTheDocument();
    expect(screen.getByText(COPY.live.sleepStat)).toBeInTheDocument();
    expect(screen.getByText("Bottle")).toBeInTheDocument();
    expect(screen.getByText("3 oz")).toBeInTheDocument();
    expect(screen.queryByText(rawGenerated)).not.toBeInTheDocument();
    expect(screen.queryByText(rawExpiry)).not.toBeInTheDocument();
    expect(screen.queryByText("feed")).not.toBeInTheDocument();
  });


  it("keeps real controller output free of preview-era claims and reports browser storage honestly", () => {
    const marker = /\b(preview|synthetic|illustrative|in-memory)\b|planned for integration|not connected/i;
    const noop = vi.fn();
    const insightProps = {
      mode: "real" as const,
      summary: { feeds: 0, sleepMinutes: 0, diapers: 0, rangeLabel: "This week" },
      routine: { status: "forming" as const, description: "More complete entries are needed.", evidence: { sampleCount: 0, requiredSamples: 21, stale: false } },
      nextEvent: { status: "forming" as const, description: "More complete intervals are needed.", evidence: { sampleCount: 0, requiredSamples: 21, stale: false } },
      generatedLabel: "Generated now",
    };
    const handoffBase = { mode: "real" as const, boundary: "8", boundaryOptions: [], summary: null, recentEvents: [], onBoundaryChange: noop, onGenerate: noop, onCopyLink: noop, onReset: noop };
    const views = [
      <CaptureView key="capture-idle" {...capture({ stage: "idle", speech: { status: "ready", locality: "local-confirmed", language: "en-US" } })} />,
      <CaptureView key="capture-disclosure" {...capture({ stage: "speech-disclosure", speech: { status: "disclosure", service: "browser-service", language: "en-US" } })} />,
      <CaptureView key="capture-listening" {...capture({ stage: "listening", speech: { status: "listening", locality: "browser-service", interim: "" } })} />,
      <CaptureView key="capture-review" {...capture({ stage: "review", sourceText: "Bottle at eight" })} />,
      <CaptureView key="capture-committed" {...capture({ stage: "committed" })} />,
      <TodayView key="today" {...today()} />,
      <TimelineView key="timeline" filter="all" groups={[]} editing={null} deletingId={null} canUndo={false} phase="idle" onFilterChange={noop} onEdit={noop} onEditChange={noop} onSaveEdit={noop} onCancelEdit={noop} onDelete={noop} onConfirmDelete={noop} onUndo={noop} />,
      <InsightsView key="insights" {...insightProps} />,
      <HandoffView key="handoff-idle" {...handoffBase} artifact={{ status: "idle" }} />,
      <HandoffView key="handoff-ready" {...handoffBase} artifact={{ status: "ready", transport: "url", fragment: "#handoff=valid", byteCount: 120, byteLimit: 4096, expiryLabel: "Expires in 12 hours" }} />,
      <PrivacyView key="privacy" {...privacy({ storageEstimate: { usageBytes: 2048, quotaBytes: 8192 } })} />,
      <SettingsView key="settings" preferences={{ nursery: false, reducedMotion: false }} profile={{ nickname: "J", timeZone: "UTC", volumeUnit: "oz", dayBoundary: "04:00" }} availableTimeZones={["UTC"]} phase="idle" onPreferenceChange={noop} onProfileSave={noop} />,
    ];
    for (const view of views) {
      const rendered = render(view);
      expect(rendered.container.textContent).not.toMatch(marker);
      rendered.unmount();
    }
    render(<PrivacyView {...privacy({ storageEstimate: { usageBytes: 2048, quotaBytes: 8192 } })} />);
    expect(screen.getByText(/2 KB used of 8 KB available/)).toBeInTheDocument();
    cleanup();
    render(<PrivacyView {...privacy({ storageEstimate: {} })} />);
    expect(screen.getByText(COPY.live.storageEstimateUnavailable)).toBeInTheDocument();
  });

  it("traps dialog focus, closes on Escape, restores its trigger, and uses unique ids", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      const [trigger, setTrigger] = useState<HTMLElement | null>(null);
      return <>
        <button type="button" onClick={(event) => { setTrigger(event.currentTarget); setOpen(true); }}>Open confirmation</button>
        <ConfirmDialog open={open} title="Confirm action" body="Review this action." confirmLabel="Confirm" trigger={trigger} onCancel={() => setOpen(false)} onConfirm={() => setOpen(false)} />
      </>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open confirmation" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Confirm action" });
    expect(dialog.getAttribute("aria-labelledby")).not.toBe("confirm-dialog-title");
    const cancel = screen.getByRole("button", { name: COPY.global.cancel });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(cancel).toHaveFocus();
    confirm.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

});