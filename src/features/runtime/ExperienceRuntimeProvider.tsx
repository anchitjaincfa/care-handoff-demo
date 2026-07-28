"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { COPY, type ExperiencePage } from "@/src/copy";
import { AppNavigation } from "@/src/features/shell/AppShell";
import { renderExperienceController } from "@/src/features/runtime/ExperienceViews";
import type { ExperienceControllerSet, ExperienceMode, PreferencesSnapshot } from "@/src/features/runtime/contracts";
import {
  createBrowserExperienceRuntime,
  type BrowserExperienceRuntimeOptions,
  type ExperienceRuntime,
} from "@/src/integration";

const DEMO_SURFACES = ["today", "capture", "timeline", "insights", "handoff", "privacy", "settings"] as const;
type DemoSurface = (typeof DEMO_SURFACES)[number];

type BrowserLocationSnapshot = {
  pathname: string;
  search: string;
  hash: string;
};

export type ResolvedExperienceRoute = {
  mode: ExperienceMode;
  page: ExperiencePage;
  runtimeOptions: BrowserExperienceRuntimeOptions;
};

export type ExperienceRuntimeClient = Pick<ExperienceRuntime, "dispose" | "getSnapshot" | "initialize" | "subscribe">;
export type ExperienceRuntimeFactory = (options: BrowserExperienceRuntimeOptions) => ExperienceRuntimeClient;

function normalizedPath(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}

function isDemoSurface(value: string | null): value is DemoSurface {
  return value !== null && (DEMO_SURFACES as readonly string[]).includes(value);
}

export function resolveExperienceRoute(page: ExperiencePage, location: BrowserLocationSnapshot): ResolvedExperienceRoute {
  const demoPath = normalizedPath(location.pathname) === "/demo";
  if (demoPath) {
    const requested = new URLSearchParams(location.search).get("surface");
    const surface = isDemoSurface(requested) ? requested : "demo";
    return { mode: "demo", page: surface, runtimeOptions: { mode: "demo" } };
  }
  if (page === "demo") throw new Error("The demo runtime is available only on /demo/.");
  if (page === "pass") {
    return {
      mode: "real",
      page,
      runtimeOptions: { mode: "real", passFragment: location.hash, viewerOnly: true },
    };
  }
  return { mode: "real", page, runtimeOptions: { mode: "real" } };
}

const STATE_COPY = {
  loading: "Opening the device-local care record…",
  loadingPass: "Opening this handoff pass…",
  errorTitle: "The local experience could not be opened",
  errorBody: "No care action was performed. Check this browser’s storage access, then try again.",
  retry: "Try again",
} as const;

function RuntimeState({ kind, retry }: { kind: "loading" | "error"; retry?: () => void }) {
  if (kind === "loading") return <p className="empty-state" role="status">{STATE_COPY.loading}</p>;
  return (
    <section className="panel" role="alert">
      <h1>{STATE_COPY.errorTitle}</h1>
      <p>{STATE_COPY.errorBody}</p>
      {retry && <button className="button button--primary" type="button" onClick={retry}>{STATE_COPY.retry}</button>}
    </section>
  );
}

function experienceFrame(
  page: ExperiencePage,
  mode: ExperienceMode,
  preferences: PreferencesSnapshot,
  children: ReactNode,
) {
  const preferenceClass = ["preference-frame", preferences.nursery ? "theme-nursery" : "", preferences.reducedMotion ? "reduce-motion" : ""].filter(Boolean).join(" ");
  if (page === "onboarding" || page === "pass") return <div className={preferenceClass}>{children}</div>;

  const frameClass = ["app-frame", preferences.nursery ? "theme-nursery" : "", preferences.reducedMotion ? "reduce-motion" : ""].filter(Boolean).join(" ");
  const navigationPage = page === "demo" ? "today" : page;
  return (
    <div className={frameClass}>
      <a className="skip-link" href="#main">{COPY.global.skipToContent}</a>
      <AppNavigation page={navigationPage} demo={mode === "demo"} />
      <main className="app-main" id="main">{children}</main>
    </div>
  );
}

function loadingFrame(page: ExperiencePage, mode: ExperienceMode) {
  const label = page === "pass" ? STATE_COPY.loadingPass : STATE_COPY.loading;
  return experienceFrame(page, mode, { nursery: false, reducedMotion: false }, <p className="empty-state" role="status">{label}</p>);
}

function RuntimeSession({
  route,
  runtime,
  onRetry,
}: {
  route: ResolvedExperienceRoute;
  runtime: ExperienceRuntimeClient;
  onRetry: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ExperienceControllerSet>(() => runtime.getSnapshot());
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const initialization = useRef<{ runtime: ExperienceRuntimeClient; promise: Promise<void> } | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = runtime.subscribe(() => {
      if (active) setSnapshot(runtime.getSnapshot());
    });
    if (initialization.current?.runtime !== runtime) {
      initialization.current = { runtime, promise: runtime.initialize() };
    }
    void initialization.current.promise.then(
      () => { if (active) setPhase("ready"); },
      () => { if (active) setPhase("error"); },
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, [runtime]);

  if (phase === "loading") return loadingFrame(route.page, route.mode);
  if (phase === "error") {
    return experienceFrame(route.page, route.mode, snapshot.settings.preferences, <RuntimeState kind="error" retry={onRetry} />);
  }
  return experienceFrame(route.page, route.mode, snapshot.settings.preferences, renderExperienceController(route.page, snapshot));
}


type SessionState =
  | { key: string; status: "ready"; route: ResolvedExperienceRoute; runtime: ExperienceRuntimeClient }
  | { key: string; status: "error"; page: ExperiencePage; mode: ExperienceMode };

export function ExperienceRuntimeProvider({
  page,
  runtimeFactory = createBrowserExperienceRuntime,
}: {
  page: ExperiencePage;
  runtimeFactory?: ExperienceRuntimeFactory;
}) {
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [retryRevision, setRetryRevision] = useState(0);
  const [session, setSession] = useState<SessionState | null>(null);
  const sessionKey = `${page}:${navigationRevision}:${retryRevision}`;

  useEffect(() => {
    const onLocationChange = () => setNavigationRevision((current) => current + 1);
    window.addEventListener("hashchange", onLocationChange);
    window.addEventListener("popstate", onLocationChange);
    return () => {
      window.removeEventListener("hashchange", onLocationChange);
      window.removeEventListener("popstate", onLocationChange);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let runtime: ExperienceRuntimeClient | null = null;
    let nextSession: SessionState;
    try {
      const route = resolveExperienceRoute(page, {
        pathname: window.location.pathname,
        search: window.location.search,
        hash: window.location.hash,
      });
      runtime = runtimeFactory(route.runtimeOptions);
      nextSession = { key: sessionKey, status: "ready", route, runtime };
    } catch {
      nextSession = { key: sessionKey, status: "error", page, mode: page === "demo" ? "demo" : "real" };
    }
    queueMicrotask(() => { if (active) setSession(nextSession); });
    return () => {
      active = false;
      if (runtime) void runtime.dispose();
    };
  }, [navigationRevision, page, retryRevision, runtimeFactory, sessionKey]);

  if (!session || session.key !== sessionKey) return loadingFrame(page, page === "demo" ? "demo" : "real");
  if (session.status === "error") {
    return experienceFrame(session.page, session.mode, { nursery: false, reducedMotion: false }, <RuntimeState kind="error" retry={() => setRetryRevision((current) => current + 1)} />);
  }
  return <RuntimeSession route={session.route} runtime={session.runtime} onRetry={() => setRetryRevision((current) => current + 1)} />;
}
