"use client";

import { COPY, type ExperiencePage } from "@/src/copy";
import { HomePreview, StatusPreview } from "@/src/features/public/PublicPages";
import {
  ExperienceRuntimeProvider,
  type ExperienceRuntimeFactory,
} from "@/src/features/runtime/ExperienceRuntimeProvider";
import { AppNavigation } from "@/src/features/shell/AppShell";

export function ExperienceApp({
  page,
  runtimeFactory,
}: {
  page: ExperiencePage;
  runtimeFactory?: ExperienceRuntimeFactory;
}) {
  if (page === "home") return <div className="preference-frame"><HomePreview /></div>;
  if (page === "status") {
    return (
      <div className="app-frame">
        <a className="skip-link" href="#main">{COPY.global.skipToContent}</a>
        <AppNavigation page="status" demo={false} />
        <main className="app-main" id="main"><StatusPreview /></main>
      </div>
    );
  }
  return <ExperienceRuntimeProvider page={page} runtimeFactory={runtimeFactory} />;
}
