import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COPY } from "@/src/copy";
import { ExperienceApp } from "@/src/features/ExperienceApp";
import { CaptureView } from "@/src/features/capture/CapturePage";
import { PassViewerView } from "@/src/features/handoff/PassViewerPage";
import { PrivacyView } from "@/src/features/privacy/PrivacyPage";
import { ExperienceViews } from "@/src/features/runtime/ExperienceViews";
import type { CapturePageProps, PrivacyPageProps, TodayPageProps } from "@/src/features/runtime/contracts";
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
});
