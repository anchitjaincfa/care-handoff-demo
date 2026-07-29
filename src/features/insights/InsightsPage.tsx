"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";
import type { InsightsPageProps, NextEventWindowViewModel, RoutineWindowViewModel } from "@/src/features/runtime/contracts";

function EvidenceProgress({ evidence }: { evidence: RoutineWindowViewModel["evidence"] }) {
  const percent = Math.min(100, Math.round((evidence.sampleCount / Math.max(1, evidence.requiredSamples)) * 100));
  return <div><div className="sample-progress" role="progressbar" aria-label={COPY.live.formingProgress} aria-valuemin={0} aria-valuemax={evidence.requiredSamples} aria-valuenow={evidence.sampleCount}><span style={{ width: `${percent}%` }} /></div><small>{evidence.sampleCount}{COPY.live.ratioSeparator}{evidence.requiredSamples}{evidence.freshnessLabel && <>{COPY.live.separator}{evidence.freshnessLabel}</>}</small></div>;
}

function ReadyRoutine({ routine }: { routine: Extract<RoutineWindowViewModel, { status: "ready" }> }) {
  return (
    <section className="insight-preview">
      <header><h2>{routine.description}</h2></header>
      <div className="range-plot"><span className="range-plot__label">{COPY.insights.rangeLabel}</span><div className="range-plot__bar"><i /><b /></div><div className="range-plot__times"><span>{routine.lowerLabel}</span><strong>{routine.medianLabel}</strong><span>{routine.upperLabel}</span></div><EvidenceProgress evidence={routine.evidence} /></div>
    </section>
  );
}

function NextWindow({ next }: { next: NextEventWindowViewModel }) {
  if (next.status === "forming") return <section className="forming-card"><div className="forming-card__icon"><Icon name="spark" /></div><div><h2>{COPY.insights.formingTitle}</h2><p>{next.description}</p><EvidenceProgress evidence={next.evidence} /></div></section>;
  return <article className="prediction-card"><span className="event-icon event-icon--feed"><Icon name="bottle" /></span><div><h3>{next.description}</h3><p>{next.windowStartLabel}{COPY.live.rangeSeparator}{next.windowEndLabel}</p><strong>{next.midpointLabel}</strong><small>{next.medianIntervalLabel}</small><EvidenceProgress evidence={next.evidence} /></div></article>;
}

export function InsightsView(props: InsightsPageProps) {
  const [showEvidence, setShowEvidence] = useState(false);
  const staleEvidence = [props.routine.evidence, props.nextEvent.evidence].find((evidence) => evidence.stale);
  return (
    <>
      <PageHeader eyebrow={COPY.insights.eyebrow} title={COPY.insights.title} intro={COPY.live.insightsIntro} />
      {props.mode === "demo" && <PreviewDisclosure>{COPY.live.demoInsightsDisclosure}</PreviewDisclosure>}
      {staleEvidence && <p className="panel-note" role="status"><Icon name="clock" /><strong>{COPY.live.staleEvidence}</strong>{staleEvidence.freshnessLabel && <>{COPY.live.separator}{staleEvidence.freshnessLabel}</>}</p>}
      {props.routine.status === "forming"
        ? <section className="forming-card"><div className="forming-card__icon"><Icon name="spark" /></div><div><h2>{COPY.insights.formingTitle}</h2><p>{props.routine.description}</p><EvidenceProgress evidence={props.routine.evidence} /></div></section>
        : <ReadyRoutine routine={props.routine} />}
      <section>
        <div className="panel-heading"><h2>{props.summary.rangeLabel}</h2>{props.mode === "demo" && <Badge tone="demo">{COPY.global.demo}</Badge>}</div>
        <div className="summary-grid">
          <article className="summary-card"><strong>{props.summary.feeds}</strong><h3>{COPY.insights.summaryCards[0].label}</h3></article>
          <article className="summary-card"><strong>{props.summary.sleepMinutes}</strong><h3>{COPY.insights.summaryCards[1].label}</h3></article>
          <article className="summary-card"><strong>{props.summary.diapers}</strong><h3>{COPY.insights.summaryCards[2].label}</h3></article>
        </div>
      </section>
      <NextWindow next={props.nextEvent} />
      <button className="evidence-button" type="button" aria-expanded={showEvidence} onClick={() => setShowEvidence((value) => !value)}>{showEvidence ? COPY.insights.hideEvidence : COPY.insights.showEvidence}<Icon name="chevron" /></button>
      {showEvidence && <section className="evidence-detail"><h2>{COPY.live.evidenceTitle}</h2><p>{props.routine.description}</p><p>{props.nextEvent.description}</p><p>{COPY.live.generated}{COPY.live.colonSeparator}{props.generatedLabel}</p></section>}
    </>
  );
}

export function InsightsPreview() {
  const [evidence, setEvidence] = useState(false);
  return (
    <>
      <PageHeader eyebrow={COPY.insights.eyebrow} title={COPY.insights.title} intro={COPY.insights.intro} />
      <PreviewDisclosure>{COPY.insights.sampleDisclosure}</PreviewDisclosure>
      <section className="forming-card">
        <div className="forming-card__icon"><Icon name="spark" /></div>
        <div><h2>{COPY.insights.formingTitle}</h2><p>{COPY.insights.formingBody}</p><div className="sample-progress"><span style={{ width: "67%" }} /></div><small>{COPY.insights.evidence}</small></div>
      </section>
      <section>
        <div className="panel-heading"><h2>{COPY.insights.sevenDay}</h2><Badge tone="preview">{COPY.global.preview}</Badge></div>
        <div className="summary-grid">{COPY.insights.summaryCards.map((card) => <article className="summary-card" key={card.label}><strong>{card.value}</strong><h3>{card.label}</h3><p>{card.note}</p></article>)}</div>
      </section>
      <section className="insight-preview">
        <header><Badge tone="preview">{COPY.insights.previewBadge}</Badge><h2>{COPY.insights.previewTitle}</h2><p>{COPY.insights.previewBody}</p></header>
        <div className="range-plot">
          <span className="range-plot__label">{COPY.insights.rangeLabel}</span>
          <div className="range-plot__bar"><i /><b /></div>
          <div className="range-plot__times"><span>{COPY.insights.rangeStart}</span><span>{COPY.insights.rangeEnd}</span></div>
          <small>{COPY.insights.sampleCount}</small>
        </div>
        <article className="prediction-card"><span className="event-icon event-icon--feed"><Icon name="bottle" /></span><div><h3>{COPY.insights.predictedTitle}</h3><p>{COPY.insights.predictedBody}</p><small>{COPY.insights.predictionCaveat}</small></div></article>
        <button className="evidence-button" type="button" onClick={() => setEvidence((value) => !value)}>{evidence ? COPY.insights.hideEvidence : COPY.insights.showEvidence}<Icon name="chevron" /></button>
        {evidence && <p className="evidence-detail">{COPY.insights.evidenceDetail}</p>}
      </section>
    </>
  );
}

export const Insights = InsightsPreview;
