"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { Badge, ConfidenceChip, ConfirmDialog, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";
import type { CapturePageProps, ProposalViewModel, ReviewFieldViewModel } from "@/src/features/runtime/contracts";

function fieldValue(field: ReviewFieldViewModel, value: string) {
  if (field.control !== "number") return value;
  return value === "" ? null : Number(value);
}

function ProposalCard({ proposal, onCorrect, disabled }: { proposal: ProposalViewModel; onCorrect: CapturePageProps["onCorrect"]; disabled: boolean }) {
  const attention = proposal.confidence < 0.8 || proposal.unresolved.length > 0;
  return (
    <article className={attention ? "review-card review-card--attention" : "review-card"}>
      <header>
        <span className={`event-icon event-icon--${proposal.type}`}><Icon name={proposal.type === "feed" ? "bottle" : proposal.type === "sleep" ? "moon" : "drop"} /></span>
        <div><h2>{proposal.title}</h2><ConfidenceChip attention={attention} /></div>
      </header>
      {proposal.unresolved.length > 0 && <p className="assumption-note" role="status"><Icon name="info" /><span><strong>{COPY.live.unresolved}</strong>{proposal.unresolved.join(", ")}</span></p>}
      <div className="review-fields">
        {proposal.fields.map((field) => (
          <label key={field.path}>
            <span>{field.label}</span>
            {field.control === "select"
              ? <select disabled={disabled} value={String(field.value ?? "")} aria-invalid={Boolean(field.error)} onChange={(event) => void onCorrect(proposal.clientId, field.path, event.target.value)}>{field.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select>
              : <input disabled={disabled} type={field.control === "time" ? "time" : field.control} inputMode={field.control === "number" ? "decimal" : undefined} value={String(field.value ?? "")} aria-invalid={Boolean(field.error)} onChange={(event) => void onCorrect(proposal.clientId, field.path, fieldValue(field, event.target.value))} />}
            {field.assumption && <small>{field.assumption}</small>}
            {field.error && <small className="field-error" role="alert">{field.error}</small>}
          </label>
        ))}
      </div>
    </article>
  );
}

function SpeechState({ props }: { props: CapturePageProps }) {
  const speech = props.speech;
  if (speech.status === "probing") return <p className="panel-note" role="status"><Icon name="mic" />{COPY.live.working}</p>;
  if (speech.status === "unavailable") return <p className="panel-note" role="status"><Icon name="info" />{speech.reason || COPY.live.speechUnavailable}</p>;
  if (speech.status === "denied") return <p className="field-error" role="alert"><Icon name="info" />{speech.reason || COPY.live.speechDenied}</p>;
  if (speech.status === "error") return <p className="field-error" role="alert"><Icon name="info" />{speech.reason}</p>;
  if (speech.status === "requesting-permission") return <p className="panel-note" role="status"><Icon name="mic" />{COPY.live.speechPermission}</p>;
  if (speech.status === "ready") return <button className="mic-button" type="button" onClick={() => void props.onAcceptSpeechDisclosure()}><span><Icon name="mic" /></span><strong>{COPY.live.captureMic}</strong></button>;
  return null;
}

export function CaptureView(props: CapturePageProps) {
  const [speechTrigger, setSpeechTrigger] = useState<HTMLElement | null>(null);
  if (props.stage === "committed") {
    return (
      <section className="success-card" aria-live="polite">
        <span className="success-card__icon"><Icon name="check" /></span><p className="eyebrow">{COPY.live.saved}</p>
        <h1>{COPY.live.committedTitle}</h1><p>{COPY.live.committedBody}</p>
        <div className="button-row"><a className="button button--primary" href="/today/">{COPY.capture.returnToday}</a><button className="button button--ghost" type="button" onClick={() => void props.onReset()}>{COPY.live.captureAgain}</button></div>
      </section>
    );
  }
  if (props.stage === "error") {
    return (
      <section className="warning-card" role="alert">
        <span className="warning-card__icon"><Icon name="info" /></span><h1>{props.error.title}</h1><p>{props.error.message}</p>
        <button className="button button--primary" type="button" onClick={() => void (props.error.recovery === "retry" ? props.onParse() : props.onReset())}>{props.error.recovery === "retry" ? COPY.live.retry : COPY.live.reset}</button>
      </section>
    );
  }
  const reviewing = props.stage === "review" || props.stage === "committing";
  return (
    <>
      <PageHeader eyebrow={reviewing ? COPY.capture.reviewEyebrow : COPY.capture.eyebrow} title={reviewing ? COPY.capture.reviewTitle : COPY.capture.title} intro={reviewing ? COPY.live.captureReviewIntro : COPY.capture.intro} />
      {(props.stage === "idle" || props.stage === "speech-disclosure") && (
        <section className="capture-card">
          <label className="capture-input"><span>{COPY.capture.inputLabel}</span><textarea value={props.sourceText} onChange={(event) => void props.onSourceTextChange(event.target.value)} placeholder={COPY.capture.placeholder} rows={5} /></label>
          <div className="capture-actions">
            <button className="button button--primary" type="button" onClick={() => void props.onParse()}>{COPY.capture.parse}<Icon name="arrow" /></button>
            <span className="or-divider" aria-hidden="true" />
            <button className="button button--soft" type="button" onClick={(event) => { setSpeechTrigger(event.currentTarget); void props.onProbeSpeech(); }}><Icon name="mic" />{COPY.live.speechProbe}</button>
          </div>
          <SpeechState props={props} />
        </section>
      )}
      <ConfirmDialog
        open={props.stage === "speech-disclosure"}
        trigger={speechTrigger}
        title={COPY.capture.disclosureTitle}
        body={COPY.live.captureDisclosureBody}
        confirmLabel={COPY.live.speechAccept}
        cancelLabel={COPY.live.speechCancel}
        onCancel={() => void props.onCancelSpeech()}
        onConfirm={() => void props.onAcceptSpeechDisclosure()}
      >
        {props.speech.status === "disclosure" && <p className="panel-note"><Icon name="info" />{props.speech.language}</p>}
      </ConfirmDialog>
      {props.stage === "listening" && (
        <section className="listening-card" aria-live="polite">
          <div className="listening-orb"><span /><span /><Icon name="mic" /></div><h2>{COPY.live.captureListening}</h2>
          <p>{props.speech.status === "listening" ? props.speech.interim || COPY.live.captureListeningHint : COPY.live.captureListeningHint}</p>
          <div className="button-row"><button className="button button--primary" type="button" onClick={() => void props.onStopSpeech()}>{COPY.capture.stopListening}</button><button className="button button--ghost" type="button" onClick={() => void props.onCancelSpeech()}>{COPY.global.cancel}</button></div>
        </section>
      )}
      {reviewing && (
        <section className="review-layout" aria-busy={props.stage === "committing"}>
          <aside className="original-note"><span>{COPY.live.originalNote}</span><p>{props.sourceText}</p></aside>
          {props.refusals.map((refusal) => <article className="warning-card" role="alert" key={refusal.clientId}><h2>{COPY.live.parseRefused}</h2><p>{refusal.sourceText}</p><p>{refusal.explanation}</p></article>)}
          <div className="review-cards">{props.proposals.map((proposal) => <ProposalCard proposal={proposal} onCorrect={props.onCorrect} key={proposal.clientId} />)}</div>
          <div className="review-footer"><button className="button button--ghost" type="button" onClick={() => void props.onReset()} disabled={props.stage === "committing"}>{COPY.global.back}</button><button className="button button--primary" type="button" onClick={() => void props.onConfirm()} disabled={props.stage === "committing" || props.proposals.length === 0 || props.proposals.some((proposal) => proposal.unresolved.length > 0)}><Icon name="check" />{props.stage === "committing" ? COPY.live.committing : COPY.live.confirmEntries}</button></div>
        </section>
      )}
    </>
  );
}

export function CapturePreview() {
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

export const Capture = CapturePreview;
