"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { ActionNotice, Brand, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";
import type { OnboardingPageProps } from "@/src/features/runtime/contracts";

const TRACKING_OPTIONS = [
  ["Feeds", "feed"],
  ["Sleep", "sleep"],
  ["Diapers", "diaper"],
  ["Pumping", "pumping"],
  ["Solids", "solids"],
  ["Tummy time", "tummy-time"],
] as const;

export function OnboardingView(props: OnboardingPageProps) {
  const pending = props.phase === "pending";
  return (
    <div className="onboarding-page">
      <header className="onboarding-top"><Brand /><a href="/demo/">{COPY.nav.demo}</a></header>
      <main>
        <div className="onboarding-progress" aria-label={COPY.onboarding.progressAria}>
          <span>{COPY.onboarding.step} {props.step} {COPY.onboarding.of} {COPY.onboarding.totalSteps}</span>
          <div><i className={props.step >= 1 ? "is-filled" : ""} /><i className={props.step >= 2 ? "is-filled" : ""} /><i className={props.step >= 3 ? "is-filled" : ""} /></div>
        </div>
        <section className="onboarding-card" aria-busy={pending}>
          <p className="eyebrow">{COPY.onboarding.eyebrow}</p>
          <h1>{props.step === 3 ? COPY.onboarding.privacyTitle : COPY.onboarding.title}</h1>
          <p className="page-intro">{props.step === 3 ? COPY.onboarding.privacyBody : COPY.onboarding.intro}</p>
          {props.step === 1 && (
            <div className="form-stack">
              <label><span>{COPY.onboarding.babyLabel}</span><input value={props.draft.babyLabel} onChange={(event) => void props.onChange("babyLabel", event.target.value)} placeholder={COPY.onboarding.babyPlaceholder} disabled={pending} /></label>
              <label><span>{COPY.onboarding.timezoneLabel}</span><select value={props.draft.timeZone} onChange={(event) => void props.onChange("timeZone", event.target.value)} disabled={pending}>{props.availableTimeZones.map((value) => <option value={value} key={value}>{value}</option>)}</select><small>{COPY.onboarding.timezoneHelp}</small></label>
              <label><span>{COPY.onboarding.localeLabel}</span><select value={props.draft.locale} onChange={(event) => void props.onChange("locale", event.target.value)} disabled={pending}><option value="en-US">{COPY.onboarding.localeUs}</option><option value="en-GB">{COPY.onboarding.localeIntl}</option></select></label>
              <label><span>{COPY.onboarding.unitsLabel}</span><select value={props.draft.volumeUnit} onChange={(event) => void props.onChange("volumeUnit", event.target.value as "oz" | "ml")} disabled={pending}><option value="oz">{COPY.onboarding.unitOz}</option><option value="ml">{COPY.onboarding.unitMl}</option></select></label>
            </div>
          )}
          {props.step === 2 && (
            <fieldset className="choice-fieldset" disabled={pending}>
              <legend>{COPY.onboarding.trackLabel}</legend>
              <div className="choice-grid">
                {TRACKING_OPTIONS.map(([label, type]) => {
                  const selected = props.draft.tracked.includes(type);
                  return <button className={selected ? "choice-chip choice-chip--selected" : "choice-chip"} type="button" aria-pressed={selected} onClick={() => void props.onToggleTracking(type)} key={type}><span className="choice-check"><Icon name="check" /></span>{label}</button>;
                })}
              </div>
            </fieldset>
          )}
          {props.step === 3 && (
            <div className="privacy-callouts">
              <article><span><Icon name="shield" /></span><div><h2>{COPY.onboarding.privacyTitle}</h2><p>{COPY.onboarding.privacyBody}</p></div></article>
              <article><span><Icon name="mic" /></span><div><h2>{COPY.onboarding.speechTitle}</h2><p>{COPY.onboarding.speechBody}</p></div></article>
            </div>
          )}
          <ActionNotice phase={props.phase} success={COPY.live.onboardingComplete} />
          <div className="onboarding-actions">
            {props.step > 1 && <button className="button button--ghost" type="button" onClick={() => void props.onBack()} disabled={pending}>{COPY.global.back}</button>}
            {props.step < 3
              ? <button className="button button--primary" type="button" onClick={() => void props.onNext()} disabled={pending}>{pending ? COPY.live.onboardingSaving : COPY.global.continue}<Icon name="arrow" /></button>
              : <button className="button button--primary" type="button" onClick={() => void props.onComplete()} disabled={pending}>{pending ? COPY.live.onboardingSaving : COPY.onboarding.finish}<Icon name="arrow" /></button>}
          </div>
        </section>
      </main>
    </div>
  );
}

export function OnboardingPreview() {
  const [step, setStep] = useState(1);
  const [nickname, setNickname] = useState("");
  const [timezone, setTimezone] = useState<string>(COPY.onboarding.timezonePacific);
  const [locale, setLocale] = useState<string>(COPY.onboarding.localeUs);
  const [units, setUnits] = useState<string>(COPY.onboarding.unitOz);
  const [tracking, setTracking] = useState<string[]>([...COPY.onboarding.tracking.slice(0, 3)]);
  const toggleTracking = (item: string) => setTracking((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  return (
    <div className="onboarding-page">
      <header className="onboarding-top"><Brand /><a href="/demo/">{COPY.nav.demo}</a></header>
      <main>
        <div className="onboarding-progress" aria-label={COPY.onboarding.progressAria}>
          <span>{COPY.onboarding.step} {step} {COPY.onboarding.of} {COPY.onboarding.totalSteps}</span>
          <div><i className={step >= 1 ? "is-filled" : ""} /><i className={step >= 2 ? "is-filled" : ""} /><i className={step >= 3 ? "is-filled" : ""} /></div>
        </div>
        <section className="onboarding-card">
          <p className="eyebrow">{COPY.onboarding.eyebrow}</p>
          <h1>{step === 3 ? COPY.onboarding.privacyTitle : COPY.onboarding.title}</h1>
          <p className="page-intro">{step === 3 ? COPY.onboarding.privacyBody : COPY.onboarding.intro}</p>
          <PreviewDisclosure>{COPY.onboarding.previewDisclosure}</PreviewDisclosure>

          {step === 1 && (
            <div className="form-stack">
              <label><span>{COPY.onboarding.babyLabel}</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder={COPY.onboarding.babyPlaceholder} /></label>
              <label><span>{COPY.onboarding.timezoneLabel}</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>{COPY.onboarding.timezonePacific}</option><option>{COPY.onboarding.timezoneEastern}</option><option>{COPY.onboarding.timezoneLondon}</option></select><small>{COPY.onboarding.timezoneHelp}</small></label>
              <label><span>{COPY.onboarding.localeLabel}</span><select value={locale} onChange={(event) => setLocale(event.target.value)}><option>{COPY.onboarding.localeUs}</option><option>{COPY.onboarding.localeIntl}</option></select></label>
              <label><span>{COPY.onboarding.unitsLabel}</span><select value={units} onChange={(event) => setUnits(event.target.value)}><option>{COPY.onboarding.unitOz}</option><option>{COPY.onboarding.unitMl}</option></select></label>
            </div>
          )}

          {step === 2 && (
            <fieldset className="choice-fieldset">
              <legend>{COPY.onboarding.trackLabel}</legend>
              <div className="choice-grid">
                {COPY.onboarding.tracking.map((item) => (
                  <button className={tracking.includes(item) ? "choice-chip choice-chip--selected" : "choice-chip"} type="button" onClick={() => toggleTracking(item)} key={item}>
                    <span className="choice-check"><Icon name="check" /></span>{item}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <div className="privacy-callouts">
              <article><span><Icon name="shield" /></span><div><h2>{COPY.onboarding.privacyTitle}</h2><p>{COPY.onboarding.privacyBody}</p></div></article>
              <article><span><Icon name="mic" /></span><div><h2>{COPY.onboarding.speechTitle}</h2><p>{COPY.onboarding.speechBody}</p></div></article>
            </div>
          )}

          <div className="onboarding-actions">
            {step > 1 && <button className="button button--ghost" type="button" onClick={() => setStep((value) => value - 1)}>{COPY.global.back}</button>}
            {step < 3 ? <button className="button button--primary" type="button" onClick={() => setStep((value) => value + 1)}>{COPY.global.continue}<Icon name="arrow" /></button> : <a className="button button--primary" href="/today/">{COPY.onboarding.finish}<Icon name="arrow" /></a>}
          </div>
        </section>
      </main>
    </div>
  );
}

export const Onboarding = OnboardingPreview;
