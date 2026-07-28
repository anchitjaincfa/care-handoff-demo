"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";

export function Insights() {
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
