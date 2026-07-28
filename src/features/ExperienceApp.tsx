"use client";

import { COPY, type ExperiencePage } from "@/src/copy";
import { Capture } from "@/src/features/capture/CapturePage";
import { Demo } from "@/src/features/demo/DemoPage";
import { Handoff } from "@/src/features/handoff/HandoffPage";
import { PassViewer } from "@/src/features/handoff/PassViewerPage";
import { Insights } from "@/src/features/insights/InsightsPage";
import { Onboarding } from "@/src/features/onboarding/OnboardingPage";
import { Settings, useExperiencePreferences } from "@/src/features/preferences/Preferences";
import { Privacy } from "@/src/features/privacy/PrivacyPage";
import { Home, Status } from "@/src/features/public/PublicPages";
import { AppNavigation } from "@/src/features/shell/AppShell";
import { Timeline } from "@/src/features/timeline/TimelinePage";
import { Today } from "@/src/features/today/TodayPage";

export function ExperienceApp({ page }: { page: ExperiencePage }) {
  const { nursery, reduced, setNursery, setReduced } = useExperiencePreferences();
  const preferenceClass = ["preference-frame", nursery ? "theme-nursery" : "", reduced ? "reduce-motion" : ""].filter(Boolean).join(" ");

  if (page === "home") return <div className={preferenceClass}><Home /></div>;
  if (page === "onboarding") return <div className={preferenceClass}><Onboarding /></div>;
  if (page === "pass") return <div className={preferenceClass}><PassViewer /></div>;

  const demo = page === "demo";
  const frameClass = ["app-frame", nursery ? "theme-nursery" : "", reduced ? "reduce-motion" : ""].filter(Boolean).join(" ");

  return (
    <div className={frameClass}>
      <a className="skip-link" href="#main">{COPY.global.skipToContent}</a>
      <AppNavigation page={page} demo={demo} />
      <main className="app-main" id="main">
        {page === "today" && <Today />}
        {page === "demo" && <Demo />}
        {page === "capture" && <Capture />}
        {page === "timeline" && <Timeline />}
        {page === "insights" && <Insights />}
        {page === "handoff" && <Handoff />}
        {page === "privacy" && <Privacy />}
        {page === "settings" && <Settings nursery={nursery} setNursery={setNursery} reduced={reduced} setReduced={setReduced} />}
        {page === "status" && <Status />}
      </main>
    </div>
  );
}
