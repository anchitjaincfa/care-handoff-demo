"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, ConfirmDialog, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";
import type { HandoffPageProps } from "@/src/features/runtime/contracts";
import type { HandoffTransport } from "@/src/domain/handoff";

export function HandoffView(props: HandoffPageProps) {
  const [consent, setConsent] = useState<{ transport: HandoffTransport; trigger: HTMLElement } | null>(null);
  const pending = props.artifact.status === "preparing";
  const request = (transport: HandoffTransport, trigger: HTMLElement) => setConsent({ transport, trigger });
  const generate = () => {
    if (!consent) return;
    void props.onGenerate(consent.transport);
    setConsent(null);
  };
  return (
    <>
      <PageHeader eyebrow={COPY.handoff.eyebrow} title={COPY.handoff.title} intro={COPY.handoff.intro} />
      {props.mode === "demo" && <PreviewDisclosure>{COPY.handoff.sampleDisclosure}</PreviewDisclosure>}
      <section className="handoff-layout" aria-busy={pending}>
        <label className="select-block"><span>{COPY.handoff.boundaryLabel}</span><select value={props.boundary} onChange={(event) => void props.onBoundaryChange(event.target.value)} disabled={pending}>{props.boundaryOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        <article className="brief-card">
          <header><div><h2>{COPY.handoff.briefTitle}</h2><p>{COPY.handoff.editableHint}</p></div>{props.mode === "demo" && <Badge tone="demo">{COPY.global.demo}</Badge>}</header>
          {props.summary ? <strong className="brief-summary">{props.summary.feeds}{COPY.live.separator}{props.summary.diapers}{COPY.live.separator}{props.summary.sleepMinutes}{COPY.live.separator}{props.summary.openTimers}</strong> : <p className="empty-state">{COPY.live.timerNoActive}</p>}
          <div className="brief-section"><h3>{COPY.handoff.recentTitle}</h3><ul>{props.recentEvents.map((event) => <li key={event.id}><time>{event.timeLabel}</time>{COPY.live.separator}{event.title}{COPY.live.separator}{event.detail}</li>)}</ul></div>
        </article>
        <div className="button-row">
          <button className="button button--primary" type="button" onClick={(event) => request("qr", event.currentTarget)} disabled={pending}><Icon name="handoff" />{COPY.live.handoffQr}</button>
          <button className="button button--soft" type="button" onClick={(event) => request("url", event.currentTarget)} disabled={pending}><Icon name="arrow" />{COPY.live.handoffUrl}</button>
        </div>
      </section>
      <ConfirmDialog open={consent !== null} trigger={consent?.trigger} title={COPY.live.handoffConsentTitle} body={COPY.live.handoffConsentBody} confirmLabel={consent?.transport === "qr" ? COPY.live.handoffQr : COPY.live.handoffUrl} onCancel={() => setConsent(null)} onConfirm={generate} />
      {props.artifact.status === "preparing" && <section className="listening-card" aria-live="polite"><Icon name="clock" /><h2>{COPY.live.handoffPreparing}</h2></section>}
      {props.artifact.status === "too-large" && <section className="warning-card" role="alert"><Icon name="info" /><h2>{COPY.live.handoffTooLarge}</h2><p>{props.artifact.byteCount}{COPY.live.ratioSeparator}{props.artifact.byteLimit}</p><button className="button button--ghost" type="button" onClick={() => void props.onReset()}>{COPY.live.rebuildHandoff}</button></section>}
      {props.artifact.status === "error" && <section className="warning-card" role="alert"><Icon name="info" /><h2>{COPY.live.handoffError}</h2><p>{props.artifact.reason}</p><button className="button button--ghost" type="button" onClick={() => void props.onReset()}>{COPY.live.rebuildHandoff}</button></section>}
      {props.artifact.status === "ready" && (
        <section className="qr-card" aria-live="polite">
          <h2>{COPY.handoff.qrTitle}</h2>
          {props.artifact.qrDataUrl ? <img src={props.artifact.qrDataUrl} alt={COPY.live.encodedQr} width={240} height={240} /> : <p className="panel-note"><Icon name="handoff" />{props.artifact.transport}</p>}
          <span className="expiry-pill"><Icon name="clock" />{props.artifact.expiryLabel}</span><small>{props.artifact.byteCount}{COPY.live.ratioSeparator}{props.artifact.byteLimit}</small>
          <div className="button-row"><button className="button button--soft" type="button" onClick={() => void props.onCopyLink()}>{COPY.live.copyReadyLink}</button><a className="button button--ghost" href={`/pass/${props.artifact.fragment}`}>{COPY.pass.eyebrow}</a></div>
          <button className="text-button" type="button" onClick={() => void props.onReset()}>{COPY.live.rebuildHandoff}</button>
        </section>
      )}
    </>
  );
}

export function HandoffPreview() {
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

export const Handoff = HandoffPreview;
