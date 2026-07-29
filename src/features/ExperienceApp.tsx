"use client";

import { COPY, type ExperiencePage } from "@/src/copy";
import { HomePreview, StatusPreview } from "@/src/features/public/PublicPages";
import {
  ExperienceRuntimeProvider,
  type ExperienceRuntimeFactory,
} from "@/src/features/runtime/ExperienceRuntimeProvider";
import { useExperiencePreferences } from "@/src/features/preferences/Preferences";
import { AppNavigation } from "@/src/features/shell/AppShell";

function StaticExperienceFrame({ page }: { page: "home" | "status" }) {
  const preferences = useExperiencePreferences();
  const preferenceClass = ["preference-frame", preferences.nursery ? "theme-nursery" : "", preferences.reduced ? "reduce-motion" : ""].filter(Boolean).join(" ");
  if (page === "home") return <div className={preferenceClass}><HomePreview /></div>;
  const frameClass = ["app-frame", preferences.nursery ? "theme-nursery" : "", preferences.reduced ? "reduce-motion" : ""].filter(Boolean).join(" ");
  return (
    <div className={frameClass}>
      <a className="skip-link" href="#main">{COPY.global.skipToContent}</a>
      <AppNavigation page="status" demo={false} />
      <main className="app-main" id="main"><StatusPreview /></main>
    </div>
  );
}

export function ExperienceApp({
  page,
  runtimeFactory,
}: {
  page: ExperiencePage;
  runtimeFactory?: ExperienceRuntimeFactory;
}) {
  if (page === "home" || page === "status") return <StaticExperienceFrame page={page} />;
  return <ExperienceRuntimeProvider page={page} runtimeFactory={runtimeFactory} />;
}
