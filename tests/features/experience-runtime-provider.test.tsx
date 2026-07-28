import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExperienceApp } from "@/src/features/ExperienceApp";
import {
  ExperienceRuntimeProvider,
  resolveExperienceRoute,
  type ExperienceRuntimeClient,
  type ExperienceRuntimeFactory,
} from "@/src/features/runtime/ExperienceRuntimeProvider";
import type { ExperienceControllerSet, ExperienceMode, TodayPageProps } from "@/src/features/runtime/contracts";
import type { BrowserExperienceRuntimeOptions } from "@/src/integration";
import { BrowserProfileStore, createDefaultProfile } from "@/src/infrastructure/storage/BrowserProfileStore";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  vi.restoreAllMocks();
  window.localStorage.clear();
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
    const realSessions: ReturnType<typeof testRuntime>[] = [];
    const demoSessions: ReturnType<typeof testRuntime>[] = [];
    const factory = vi.fn<ExperienceRuntimeFactory>((options) => {
      const session = testRuntime(options.mode ?? "real");
      (options.mode === "demo" ? demoSessions : realSessions).push(session);
      return session.runtime;
    });
    const rendered = render(<ExperienceRuntimeProvider page="today" runtimeFactory={factory} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Runtime baby" })).toBeInTheDocument());
    await waitFor(() => expect(realSessions.some((session) => vi.mocked(session.runtime.subscribe).mock.calls.length > 0)).toBe(true));
    const activeReal = [...realSessions].reverse().find((session) => vi.mocked(session.runtime.subscribe).mock.calls.length > 0);
    expect(activeReal).toBeDefined();
    expect(activeReal?.runtime.initialize).toHaveBeenCalled();
    const subscribedAt = (activeReal?.runtime.subscribe as ReturnType<typeof vi.fn> | undefined)?.mock.invocationCallOrder[0];
    const initializedAt = (activeReal?.runtime.initialize as ReturnType<typeof vi.fn> | undefined)?.mock.invocationCallOrder[0];
    expect(subscribedAt ?? Number.MAX_SAFE_INTEGER).toBeLessThan(initializedAt ?? 0);

    window.history.replaceState(null, "", "/demo/");
    rendered.rerender(<ExperienceRuntimeProvider page="demo" runtimeFactory={factory} />);
    await waitFor(() => expect(demoSessions.length).toBeGreaterThan(0));
    expect(activeReal?.unsubscribe).toHaveBeenCalled();
    expect(activeReal?.runtime.dispose).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Runtime baby" })).toBeInTheDocument());
  });


  it("publishes runtime notifications during initialization without resubscribing or looping", async () => {
    window.history.replaceState(null, "", "/today/");
    const listeners = new Set<() => void>();
    let unsubscribeCalls = 0;
    let snapshot = controller("real");
    const runtime: ExperienceRuntimeClient = {
      subscribe: vi.fn((listener) => {
        listeners.add(listener);
        return () => {
          unsubscribeCalls += 1;
          listeners.delete(listener);
        };
      }),
      getSnapshot: vi.fn(() => snapshot),
      initialize: vi.fn(async () => {
        snapshot = controller("real");
        snapshot.today.title = "Initialized baby";
        for (const listener of listeners) listener();
      }),
      dispose: vi.fn(async () => undefined),
    };
    render(<ExperienceRuntimeProvider page="today" runtimeFactory={() => runtime} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Initialized baby" })).toBeInTheDocument());
    expect(vi.mocked(runtime.initialize).mock.calls.length).toBe(vi.mocked(runtime.subscribe).mock.calls.length);
    expect(vi.mocked(runtime.initialize).mock.calls.length).toBeLessThanOrEqual(2);
    expect(listeners.size).toBe(1);
    expect(unsubscribeCalls).toBe(vi.mocked(runtime.subscribe).mock.calls.length - 1);
    expect(vi.mocked(runtime.getSnapshot).mock.calls.length).toBeLessThan(20);
  });

  it("uses the real runtime profile as the static Home and Status theme authority", () => {
    const store = new BrowserProfileStore("real", window.localStorage, "UTC");
    store.write({ ...createDefaultProfile("real", "UTC"), preferences: { nursery: true, reducedMotion: true } });
    const home = render(<ExperienceApp page="home" />);
    expect(home.container.querySelector(".preference-frame")).toHaveClass("theme-nursery", "reduce-motion");
    home.unmount();
    const status = render(<ExperienceApp page="status" />);
    expect(status.container.querySelector(".app-frame")).toHaveClass("theme-nursery", "reduce-motion");
  });

  it("keeps loading honest, exposes initialization failure, and retries with a fresh runtime", async () => {
    window.history.replaceState(null, "", "/today/");
    let shouldFail = true;
    const failedSessions: ReturnType<typeof testRuntime>[] = [];
    const recoveredSessions: ReturnType<typeof testRuntime>[] = [];
    const factory = vi.fn<ExperienceRuntimeFactory>(() => {
      const session = testRuntime("real", shouldFail
        ? async () => { throw new Error("storage unavailable"); }
        : async () => undefined);
      (shouldFail ? failedSessions : recoveredSessions).push(session);
      return session.runtime;
    });

    render(<ExperienceRuntimeProvider page="today" runtimeFactory={factory} />);
    expect(screen.getByRole("status")).toHaveTextContent(/Opening the device-local/);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No care action was performed"));

    shouldFail = false;
    const retry = await screen.findByRole("button", { name: "Try again" });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Runtime baby" })).toBeInTheDocument());
    expect(recoveredSessions.length).toBeGreaterThan(0);
    expect(failedSessions.some((session) => vi.mocked(session.runtime.dispose).mock.calls.length > 0)).toBe(true);
  });

  it("wires ExperienceApp to the live controller view and runtime-owned preference classes", async () => {
    window.history.replaceState(null, "", "/today/");
    const sessions: ReturnType<typeof testRuntime>[] = [];
    const factory: ExperienceRuntimeFactory = () => {
      const session = testRuntime("real", async () => undefined, { nursery: true, reducedMotion: true });
      sessions.push(session);
      return session.runtime;
    };
    const { container } = render(<ExperienceApp page="today" runtimeFactory={factory} />);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Runtime baby" })).toBeInTheDocument());
    expect(sessions.length).toBeGreaterThan(0);
    await waitFor(() => {
      const frame = container.querySelector(".app-frame");
      expect(frame).toHaveClass("theme-nursery");
      expect(frame).toHaveClass("reduce-motion");
    });
  });
});
