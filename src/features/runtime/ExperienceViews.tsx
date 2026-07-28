"use client";

import type { ReactElement } from "react";
import type { ExperiencePage } from "@/src/copy";
import { CaptureView } from "@/src/features/capture/CapturePage";
import { DemoView } from "@/src/features/demo/DemoPage";
import { HandoffView } from "@/src/features/handoff/HandoffPage";
import { PassViewerView } from "@/src/features/handoff/PassViewerPage";
import { InsightsView } from "@/src/features/insights/InsightsPage";
import { OnboardingView } from "@/src/features/onboarding/OnboardingPage";
import { SettingsView } from "@/src/features/preferences/Preferences";
import { PrivacyView } from "@/src/features/privacy/PrivacyPage";
import { HomeView, StatusView } from "@/src/features/public/PublicPages";
import type { ExperienceControllerSet } from "@/src/features/runtime/contracts";
import { TimelineView } from "@/src/features/timeline/TimelinePage";
import { TodayView } from "@/src/features/today/TodayPage";

export const ExperienceViews = Object.freeze({
  home: HomeView,
  onboarding: OnboardingView,
  today: TodayView,
  demo: DemoView,
  capture: CaptureView,
  timeline: TimelineView,
  insights: InsightsView,
  handoff: HandoffView,
  privacy: PrivacyView,
  settings: SettingsView,
  status: StatusView,
  pass: PassViewerView,
});

export function renderExperienceController(page: ExperiencePage, controllers: ExperienceControllerSet): ReactElement {
  switch (page) {
    case "home": return <HomeView {...controllers.home} />;
    case "onboarding": return <OnboardingView {...controllers.onboarding} />;
    case "today": return <TodayView {...controllers.today} />;
    case "demo": return <DemoView {...controllers.demo} />;
    case "capture": return <CaptureView {...controllers.capture} />;
    case "timeline": return <TimelineView {...controllers.timeline} />;
    case "insights": return <InsightsView {...controllers.insights} />;
    case "handoff": return <HandoffView {...controllers.handoff} />;
    case "privacy": return <PrivacyView {...controllers.privacy} />;
    case "settings": return <SettingsView {...controllers.settings} />;
    case "status": return <StatusView {...controllers.status} />;
    case "pass": return <PassViewerView {...controllers.pass} />;
  }
}
