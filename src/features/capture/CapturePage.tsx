"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, ConfidenceChip, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";

export function Capture() {
  const [stage, setStage] = useState<"idle" | "disclosure" | "listening" | "review" | "saved">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);
  const review = () => {
    if (!note.trim()) { setError(true); return; }
    setError(false);
    setStage("review");
  };
  if (stage === "saved") {
    return (
      <section className="success-card">
        <span className="success-card__icon"><Icon name="check" /></span>
        <p className="eyebrow">{COPY.global.saved}</p>
        <h1>{COPY.capture.savedTitle}</h1>
        <p>{COPY.capture.savedBody}</p>
        <div className="button-row"><a className="button button--primary" href="/today/">{COPY.capture.returnToday}</a><button className="button button--ghost" type="button" onClick={() => { setStage("idle"); setNote(""); }}>{COPY.capture.addAnother}</button></div>
      </section>
    );
  }
  return (
    <>
      <PageHeader eyebrow={stage === "review" ? COPY.capture.reviewEyebrow : COPY.capture.eyebrow} title={stage === "review" ? COPY.capture.reviewTitle : COPY.capture.title} intro={stage === "review" ? COPY.capture.reviewIntro : COPY.capture.intro} />
      {stage === "idle" && (
        <section className="capture-card">
          <label className="capture-input"><span>{COPY.capture.inputLabel}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={COPY.capture.placeholder} rows={5} /></label>
          {error && <p className="field-error" role="alert">{COPY.capture.emptyError}</p>}
          <div className="capture-actions">
            <button className="button button--primary" type="button" onClick={review}>{COPY.capture.parse}<Icon name="arrow" /></button>
            <span className="or-divider" aria-hidden="true" />
            <button className="mic-button" type="button" onClick={() => setStage("disclosure")}><span><Icon name="mic" /></span><strong>{COPY.capture.mic}</strong></button>
          </div>
          <p className="microcopy"><Icon name="info" />{COPY.capture.micUnavailable}</p>
        </section>
      )}
      {stage === "disclosure" && (
        <section className="disclosure-card">
          <Badge tone="preview">{COPY.global.preview}</Badge>
          <span className="disclosure-card__icon"><Icon name="mic" /></span>
          <h2>{COPY.capture.disclosureTitle}</h2>
          <p>{COPY.capture.disclosureBody}</p>
          <div className="button-row"><button className="button button--primary" type="button" onClick={() => setStage("listening")}>{COPY.capture.disclosureAccept}</button><button className="button button--ghost" type="button" onClick={() => setStage("idle")}>{COPY.global.cancel}</button></div>
        </section>
      )}
      {stage === "listening" && (
        <section className="listening-card" aria-live="polite">
          <Badge tone="preview">{COPY.global.preview}</Badge>
          <div className="listening-orb"><span /><span /><Icon name="mic" /></div>
          <h2>{COPY.capture.listening}</h2>
          <p>{COPY.capture.listeningHint}</p>
          <button className="button button--primary" type="button" onClick={() => { setNote(COPY.capture.sampleTranscript); setStage("review"); }}>{COPY.capture.stopListening}</button>
        </section>
      )}
      {stage === "review" && (
        <section className="review-layout">
          <PreviewDisclosure>{COPY.capture.reviewPreview}</PreviewDisclosure>
          <aside className="original-note"><span>{COPY.capture.original}</span><p>{note || COPY.capture.sampleTranscript}</p></aside>
          <div className="review-cards">
            <article className="review-card">
              <header><span className="event-icon event-icon--feed"><Icon name="bottle" /></span><div><h2>{COPY.capture.firstCard}</h2><ConfidenceChip /></div></header>
              <div className="review-fields">
                <label><span>{COPY.capture.time}</span><input defaultValue={COPY.capture.reviewTimeOne} /></label>
                <label><span>{COPY.capture.amount}</span><div className="compound-input"><input defaultValue={COPY.capture.reviewAmount} inputMode="decimal" /><select defaultValue="fl oz"><option value="fl oz">{COPY.onboarding.unitOz}</option><option value="mL">{COPY.onboarding.unitMl}</option></select></div></label>
                <label><span>{COPY.capture.contents}</span><select><option>{COPY.capture.formula}</option></select></label>
              </div>
            </article>
            <article className="review-card review-card--attention">
              <header><span className="event-icon event-icon--diaper"><Icon name="drop" /></span><div><h2>{COPY.capture.secondCard}</h2><ConfidenceChip attention /></div></header>
              <div className="review-fields">
                <label><span>{COPY.capture.time}</span><input defaultValue={COPY.capture.reviewTimeTwo} /></label>
                <label><span>{COPY.capture.diaperType}</span><select><option>{COPY.capture.wet}</option></select></label>
              </div>
              <p className="assumption-note"><Icon name="info" /><span><strong>{COPY.capture.assumed}</strong>{COPY.capture.assumedNow}</span></p>
            </article>
          </div>
          <div className="review-footer"><button className="button button--ghost" type="button" onClick={() => setStage("idle")}>{COPY.global.back}</button><button className="button button--primary" type="button" onClick={() => setStage("saved")}><Icon name="check" />{COPY.capture.save}</button></div>
        </section>
      )}
    </>
  );
}
