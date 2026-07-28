"use client";

import Link from "next/link";
import { COPY } from "@/src/copy";
import { ActionNotice, Badge } from "@/src/features/shared/ExperiencePrimitives";
import type { DemoPageProps } from "@/src/features/runtime/contracts";
import { Today, TodayView } from "@/src/features/today/TodayPage";

export function DemoView(props: DemoPageProps) {
  return (
    <>
      <div className="demo-banner"><Badge tone="demo">{COPY.live.demoRealm}</Badge><span>{COPY.demo.banner}</span><Link href="/">{COPY.live.leaveDemo}</Link></div>
      <aside className="preview-disclosure"><Badge tone="demo">{COPY.live.demoRealm}</Badge><p>{COPY.live.demoIsolation}</p></aside>
      <TodayView {...props.today} mode="demo" />
      <button className="button button--ghost" type="button" onClick={() => void props.onReset()} disabled={props.resetPhase === "pending"}>{COPY.live.demoReset}</button>
      <ActionNotice phase={props.resetPhase} success={COPY.live.demoResetDone} />
    </>
  );
}

export function DemoPreview() {
  return <Today demo />;
}

export const Demo = DemoPreview;