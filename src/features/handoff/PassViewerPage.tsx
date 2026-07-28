"use client";

import { useSyncExternalStore } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, Brand } from "@/src/features/shared/ExperiencePrimitives";
import type { PassViewerPageProps } from "@/src/features/runtime/contracts";

type PassState = "demo" | "invalid" | "expired";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

const PLACEHOLDER_PASS_HASHES = {
  invalid: "#invalid",
  expired: "#expired",
} as const;

/**
 * TODO(integration): Replace this placeholder hash reader with the handoff-codec
 * adapter. Keep PassState as the view boundary so invalid and expired payloads
 * remain explicit states rather than falling through to demo content.
 */
function readPassState(): PassState {
  if (window.location.hash === PLACEHOLDER_PASS_HASHES.invalid) return "invalid";
  if (window.location.hash === PLACEHOLDER_PASS_HASHES.expired) return "expired";
  return "demo";
}

function readDemoPassState(): PassState {
  return "demo";
}

function PassSummary({ summary }: { summary: Extract<PassViewerPageProps["state"], { status: "valid" }>["summary"] }) {
  return (
    <dl className="summary-grid">
      <div><dt>{COPY.live.feedsStat}</dt><dd>{summary.feeds}</dd></div>
      <div><dt>{COPY.live.diapersStat}</dt><dd>{summary.diapers}</dd></div>
      <div><dt>{COPY.live.sleepStat}</dt><dd>{summary.sleepMinutes}{COPY.live.separator}{COPY.live.minutesUnit}</dd></div>
      <div><dt>{COPY.live.openTimersStat}</dt><dd>{summary.openTimers}</dd></div>
    </dl>
  );
}

export function PassViewerView({ state }: PassViewerPageProps) {
  if (state.status !== "valid") {
    const expired = state.status === "expired";
    const invalid = state.status === "invalid";
    return (
      <div className="pass-page">
        <header><Brand /></header><main><section className="pass-state" role={invalid ? "alert" : undefined}>
          <span><Icon name={expired ? "clock" : "info"} /></span><p className="eyebrow">{COPY.pass.eyebrow}</p>
          <h1>{expired ? COPY.pass.expiredStateTitle : invalid ? COPY.pass.invalidTitle : COPY.live.passEmptyTitle}</h1>
          <p>{expired ? COPY.live.passExpiredBody : invalid ? state.reason || COPY.live.passInvalidBody : COPY.live.passEmptyBody}</p>
        </section></main><footer>{COPY.global.codenameDisclaimer}</footer>
      </div>
    );
  }
  const { payload, summary, generatedLabel, expiryLabel, events } = state;
  return (
    <div className="pass-page">
      <header><Brand /><Badge tone={payload.provenance === "demo" ? "demo" : "live"}>{payload.provenance === "demo" ? COPY.global.demoSharedCopy : COPY.global.realSharedCopy}</Badge></header>
      <main>
        <div className="pass-heading"><p className="eyebrow">{COPY.pass.eyebrow}</p><h1>{payload.babyLabel}</h1><p>{generatedLabel}</p></div>
        <section className="pass-source"><Icon name="clock" /><div><h2>{COPY.live.passSourceTimeZone}</h2><p>{payload.v === 2 ? payload.timeZone : COPY.live.passSourceTimeZoneUnavailable}</p><p>{COPY.live.passSourceTimeZoneBody}</p></div></section>
        <section className="pass-brief">
          <h2>{COPY.live.passSummary}</h2>
          <PassSummary summary={summary} />
          <div><h2>{COPY.live.passEvents}</h2><ul>{events.map((event) => <li key={event.id}><time>{event.timeLabel}</time><strong>{event.title}</strong><span>{event.detail}</span></li>)}</ul></div>
        </section>
        <section className="pass-expiry"><Icon name="clock" /><div><h2>{COPY.pass.expiredTitle}</h2><p>{expiryLabel}</p><p>{COPY.pass.expiredBody}</p></div></section>
        <p className="provenance"><Icon name="shield" />{COPY.pass.provenance}</p>
      </main><footer>{COPY.global.codenameDisclaimer}</footer>
    </div>
  );
}

export function PassViewerPreview() {
  const passState = useSyncExternalStore(subscribeHash, readPassState, readDemoPassState);

  if (passState !== "demo") {
    const expired = passState === "expired";
    return (
      <div className="pass-page">
        <header><Brand /></header>
        <main>
          <section className="pass-state">
            <span><Icon name={expired ? "clock" : "info"} /></span>
            <p className="eyebrow">{COPY.pass.eyebrow}</p>
            <h1>{expired ? COPY.pass.expiredStateTitle : COPY.pass.invalidTitle}</h1>
            <p>{expired ? COPY.pass.expiredStateBody : COPY.pass.invalidBody}</p>
          </section>
        </main>
        <footer>{COPY.global.codenameDisclaimer}</footer>
      </div>
    );
  }

  return (
    <div className="pass-page">
      <header><Brand /><Badge tone="demo">{COPY.pass.source}</Badge></header>
      <main>
        <div className="pass-heading"><p className="eyebrow">{COPY.pass.eyebrow}</p><h1>{COPY.pass.title}</h1><p>{COPY.pass.generated}</p></div>
        <section className="pass-source"><Icon name="info" /><div><h2>{COPY.pass.source}</h2><p>{COPY.pass.sourceBody}</p></div></section>
        <section className="pass-brief"><strong>{COPY.pass.summary}</strong><div><h2>{COPY.pass.open}</h2><p>{COPY.pass.none}</p></div><div><h2>{COPY.pass.recents}</h2><ul>{COPY.handoff.recentItems.map((item) => <li key={item}>{item}</li>)}</ul></div></section>
        <section className="pass-expiry"><Icon name="clock" /><div><h2>{COPY.pass.expiredTitle}</h2><p>{COPY.pass.expiredBody}</p></div></section>
        <p className="provenance"><Icon name="shield" />{COPY.pass.provenance}</p>
      </main>
      <footer>{COPY.global.codenameDisclaimer}</footer>
    </div>
  );
}

export const PassViewer = PassViewerPreview;
