import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExperienceApp } from "@/src/features/ExperienceApp";
import {
  ExperienceRuntimeProvider,
  resolveExperienceRoute,
  type ExperienceRuntimeClient,
  type ExperienceRuntimeFactory,
} from "@/src/features/runtime/ExperienceRuntimeProvider";
import type { ExperienceControllerSet, ExperienceMode, TodayPageProps } from "@/src/features/runtime/contracts";
import type { BrowserExperienceRuntimeOptions } from "@/src/integration";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  vi.restoreAllMocks();
});

function controller(mode: ExperienceMode, preferences = { nursery: false, reducedMotion: false }): ExperienceControllerSet {
  const today: TodayPageProps = {
    mode,
    title: "Runtime baby",
    dateLabel: "Monday",
    dayBoundaryLabel: "Day boundary 04:00",
    quickActions: [],
    activeTimers: [],
    recentEvents: [],
    canUndo: false,
    phase: "idle",
    onQuickLog: vi.fn(),
    onStartTimer: vi.fn(),
    onStopTimer: vi.fn(),
    onUndo: vi.fn(),
  };
  return {
    mode,
    today,
    demo: { today, resetPhase: "idle", onReset: vi.fn() },
    settings: {
      preferences,
      profile: { nickname: "Runtime baby", timeZone: "UTC", volumeUnit: "oz", dayBoundary: "04:00" },
      availableTimeZones: ["UTC"],
      phase: "idle",
      onPreferenceChange: vi.fn(),
      onProfileSave: vi.fn(),
    },
    pass: { state: { status: "empty" } },
  } as unknown as ExperienceControllerSet;
}

function testRuntime(
  mode: ExperienceMode,
  initialize: () => Promise<void> = async () => undefined,
  preferences = { nursery: false, reducedMotion: false },
) {
  const unsubscribe = vi.fn();
  const runtime: ExperienceRuntimeClient = {
    initialize: vi.fn(initialize),
    subscribe: vi.fn(() => unsubscribe),
    getSnapshot: vi.fn(() => controller(mode, preferences)),
    dispose: vi.fn(async () => undefined),
  };
  return { runtime, unsubscribe };
}

describe("production experience provider seam", () => {
  it("resolves an allowlisted demo query surface only under /demo", () => {
    const demo = resolveExperienceRoute("demo", { pathname: "/demo/", search: "?surface=timeline", hash: "#ignored" });
    expect(demo).toMatchObject({ mode: "demo", page: "timeline", runtimeOptions: { mode: "demo" } });
    expect(() => resolveExperienceRoute("demo", { pathname: "/today/", search: "", hash: "" })).toThrow(/only on \/demo/);
    expect(resolveExperienceRoute("today", { pathname: "/today/", search: "", hash: "" }).mode).toBe("real");
  });

  it("forwards the pass hash unmodified into a viewer-only runtime", async () => {
    const rawHash = "#handoff=A%2FB+raw";
    window.history.replaceState(null, "", `/pass/${rawHash}`);
    const observed: BrowserExperienceRuntimeOptions[] = [];
    const pending = testRuntime("real", () => new Promise(() => undefined));
    const factory: ExperienceRuntimeFactory = (options) => { observed.push(options); return pending.runtime; };

    render(<ExperienceRuntimeProvider page="pass" runtimeFactory={factory} />);

    await waitFor(() => expect(observed).toHaveLength(1));
    expect(observed[0]).toEqual({ mode: "real", passFragment: rawHash, viewerOnly: true });
  });

  it("subscribes before initialization and disposes on a realm switch", async () => {
    window.history.replaceState(null, "", "/today/");
    const real = testRuntime("real");
    const demo = testRuntime("demo");
    const factory = vi.fn<ExperienceRuntimeFactory>()
      .mockReturnValueOnce(real.runtime)
      .mockReturnValueOnce(demo.runtime);
    const rendered = render(<ExperienceRuntimeProvider page="today" runtimeFactory={factory} />);
    await screen.findByRole("heading", { name: "Runtime baby" });
    expect(real.runtime.subscribe).toHaveBeenCalled();
    expect(real.runtime.initialize).toHaveBeenCalled();
    expect((real.runtime.subscribe as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((real.runtime.initialize as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);

    window.history.replaceState(null, "", "/demo/");
    rendered.rerender(<ExperienceRuntimeProvider page="demo" runtimeFactory={factory} />);
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
    expect(real.unsubscribe).toHaveBeenCalled();
    expect(real.runtime.dispose).toHaveBeenCalledOnce();
    await screen.findByRole("heading", { name: "Runtime baby" });
  });

  it("keeps loading honest, exposes initialization failure, and retries with a fresh runtime", async () => {
    window.history.replaceState(null, "", "/today/");
    let resolveFirst!: () => void;
    const first = testRuntime("real", () => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    const failed = testRuntime("real", async () => { throw new Error("storage unavailable"); });
    const recovered = testRuntime("real");
    const factory = vi.fn<ExperienceRuntimeFactory>()
      .mockReturnValueOnce(first.runtime)
      .mockReturnValueOnce(failed.runtime)
      .mockReturnValueOnce(recovered.runtime);

    const firstRender = render(<ExperienceRuntimeProvider page="today" runtimeFactory={factory} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Opening the device-local/);
    firstRender.unmount();
    await act(async () => resolveFirst());
    expect(first.runtime.dispose).toHaveBeenCalledOnce();

    render(<ExperienceRuntimeProvider page="today" runtimeFactory={factory} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No care action was performed");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Runtime baby" })).toBeInTheDocument();
    expect(failed.runtime.dispose).toHaveBeenCalledOnce();
  });

  it("wires ExperienceApp to the live controller view and runtime-owned preference classes", async () => {
    window.history.replaceState(null, "", "/today/");
    const live = testRuntime("real", async () => undefined, { nursery: true, reducedMotion: true });
    const { container } = render(<ExperienceApp page="today" runtimeFactory={() => live.runtime} />);

    expect(await screen.findByRole("heading", { name: "Runtime baby" })).toBeInTheDocument();
    const frame = container.querySelector(".app-frame");
    expect(frame).toHaveClass("theme-nursery");
    expect(frame).toHaveClass("reduce-motion");
  });
});
