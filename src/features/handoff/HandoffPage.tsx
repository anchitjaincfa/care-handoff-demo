"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";

export function Handoff() {
  const [stage, setStage] = useState<"edit" | "warning" | "ready">("edit");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/pass/#demo");
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };
  return (
    <>
      <PageHeader eyebrow={COPY.handoff.eyebrow} title={COPY.handoff.title} intro={COPY.handoff.intro} />
      <PreviewDisclosure>{COPY.handoff.sampleDisclosure}</PreviewDisclosure>
      {stage === "edit" && (
        <section className="handoff-layout">
          <label className="select-block"><span>{COPY.handoff.boundaryLabel}</span><select>{COPY.handoff.boundaryOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <article className="brief-card">
            <header><div><h2>{COPY.handoff.briefTitle}</h2><p>{COPY.handoff.editableHint}</p></div><Badge tone="preview">{COPY.global.preview}</Badge></header>
            <strong className="brief-summary">{COPY.handoff.summary}</strong>
            <div className="brief-section"><h3>{COPY.handoff.openTitle}</h3><p>{COPY.handoff.openBody}</p></div>
            <div className="brief-section"><h3>{COPY.handoff.recentTitle}</h3><ul>{COPY.handoff.recentItems.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <label><span>{COPY.handoff.noteLabel}</span><textarea rows={3} placeholder={COPY.handoff.notePlaceholder} /></label>
          </article>
          <button className="button button--primary button--wide" type="button" onClick={() => setStage("warning")}>{COPY.handoff.generate}<Icon name="arrow" /></button>
        </section>
      )}
      {stage === "warning" && (
        <section className="warning-card">
          <span className="warning-card__icon"><Icon name="handoff" /></span>
          <h2>{COPY.handoff.warningTitle}</h2>
          <p>{COPY.handoff.warningBody}</p>
          <ul><li><Icon name="info" />{COPY.handoff.warningHistory}</li><li><Icon name="clock" />{COPY.handoff.warningExpiry}</li></ul>
          <div className="button-row"><button className="button button--primary" type="button" onClick={() => setStage("ready")}>{COPY.handoff.agree}</button><button className="button button--ghost" type="button" onClick={() => setStage("edit")}>{COPY.global.back}</button></div>
        </section>
      )}
      {stage === "ready" && (
        <section className="qr-card">
          <h2>{COPY.handoff.qrTitle}</h2>
          <div className="pass-placeholder-tile" role="img" aria-label={COPY.handoff.qrAlt}>{Array.from({ length: 81 }, (_, index) => <i className={index % 3 === 0 || index % 7 === 0 || [1, 9, 63, 71].includes(index) ? "is-dark" : ""} key={index} />)}</div>
          <p>{COPY.handoff.qrHint}</p>
          <span className="expiry-pill"><Icon name="clock" />{COPY.handoff.expires}</span>
          <small>{COPY.handoff.size}</small>
          <div className="button-row"><button className="button button--soft" type="button" onClick={copyLink}>{copyState === "copied" ? COPY.handoff.copied : copyState === "unavailable" ? COPY.handoff.copyUnavailable : COPY.handoff.copyLink}</button><button className="button button--ghost" type="button" disabled>{COPY.handoff.print}</button></div>
          <button className="text-button" type="button" onClick={() => setStage("edit")}>{COPY.handoff.rebuild}</button>
        </section>
      )}
    </>
  );
}
