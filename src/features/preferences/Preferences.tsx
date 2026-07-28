"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { ActionNotice, Badge, PageHeader, ToastMessage, type Toast } from "@/src/features/shared/ExperiencePrimitives";
import type { SettingsPageProps, SettingsProfile } from "@/src/features/runtime/contracts";

const PREFERENCE_EVENT = "nuzzlecue-preference-change";
const NURSERY_KEY = "nuzzlecue-nursery-theme";
const MOTION_KEY = "nuzzlecue-reduced-motion";

function subscribePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PREFERENCE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PREFERENCE_EVENT, callback);
  };
}

function readPreference(key: string) {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function readNurseryPreference() {
  return readPreference(NURSERY_KEY);
}

function readMotionPreference() {
  return readPreference(MOTION_KEY);
}

function readFalse() {
  return false;
}

function writePreference(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

export function useExperiencePreferences() {
  const nursery = useSyncExternalStore(subscribePreferences, readNurseryPreference, readFalse);
  const reduced = useSyncExternalStore(subscribePreferences, readMotionPreference, readFalse);
  return {
    nursery,
    reduced,
    setNursery: (value: boolean) => writePreference(NURSERY_KEY, value),
    setReduced: (value: boolean) => writePreference(MOTION_KEY, value),
  };
}

export function Toggle({ checked, onChange, label, body }: { checked: boolean; onChange: () => void; label: string; body: string }) {
  return (
    <button className="toggle-row" type="button" role="switch" aria-checked={checked} onClick={onChange}>
      <span><strong>{label}</strong><small>{body}</small></span><i className={checked ? "toggle toggle--on" : "toggle"}><b /></i>
    </button>
  );
}

export function SettingsView(props: SettingsPageProps) {
  const [draft, setDraft] = useState<SettingsProfile>(props.profile);
  useEffect(() => setDraft(props.profile), [props.profile]);
  const update = <K extends keyof SettingsProfile>(key: K, value: SettingsProfile[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const pending = props.phase === "pending";
  return (
    <>
      <PageHeader eyebrow={COPY.settings.eyebrow} title={COPY.settings.title} intro={COPY.settings.intro} />
      <section className="settings-section">
        <h2>{COPY.settings.appearanceTitle}</h2>
        <Toggle checked={props.preferences.nursery} onChange={() => void props.onPreferenceChange("nursery", !props.preferences.nursery)} label={COPY.settings.nurseryTheme} body={COPY.settings.nurseryBody} />
        <Toggle checked={props.preferences.reducedMotion} onChange={() => void props.onPreferenceChange("reducedMotion", !props.preferences.reducedMotion)} label={COPY.settings.motion} body={COPY.settings.motionBody} />
        <p className="panel-note"><Icon name="check" />{COPY.live.settingsHydrated}</p>
      </section>
      <section className="settings-section" aria-busy={pending}>
        <h2>{COPY.settings.profileTitle}</h2>
        <div className="settings-form">
          <label><span>{COPY.settings.nickname}</span><input value={draft.nickname} onChange={(event) => update("nickname", event.target.value)} disabled={pending} /></label>
          <label><span>{COPY.settings.timezone}</span><select value={draft.timeZone} onChange={(event) => update("timeZone", event.target.value)} disabled={pending}><option value="America/Los_Angeles">{COPY.onboarding.timezonePacific}</option><option value="America/New_York">{COPY.onboarding.timezoneEastern}</option><option value="Europe/London">{COPY.onboarding.timezoneLondon}</option></select></label>
          <label><span>{COPY.settings.units}</span><select value={draft.volumeUnit} onChange={(event) => update("volumeUnit", event.target.value as "oz" | "ml")} disabled={pending}><option value="oz">{COPY.onboarding.unitOz}</option><option value="ml">{COPY.onboarding.unitMl}</option></select></label>
          <label><span>{COPY.settings.dayBoundary}</span><input value={draft.dayBoundary} onChange={(event) => update("dayBoundary", event.target.value)} disabled={pending} /></label>
        </div>
        <button className="button button--primary" type="button" onClick={() => void props.onProfileSave(draft)} disabled={pending}>{pending ? COPY.live.working : COPY.settings.save}</button>
        <ActionNotice phase={props.phase} success={COPY.live.settingsSaved} />
      </section>
      <section className="settings-section install-section"><span><Icon name="download" /></span><div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.settings.installTitle}</h2><p>{COPY.settings.installBody}</p><button className="text-button" type="button" disabled>{COPY.settings.installHelp}</button></div></section>
      <section className="future-grid"><article><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.settings.collaborationTitle}</h2><p>{COPY.settings.collaborationBody}</p></article><article><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.settings.notificationsTitle}</h2><p>{COPY.settings.notificationsBody}</p></article></section>
    </>
  );
}

export function SettingsPreview({
  nursery,
  setNursery,
  reduced,
  setReduced,
}: {
  nursery: boolean;
  setNursery: (value: boolean) => void;
  reduced: boolean;
  setReduced: (value: boolean) => void;
}) {
  const [toast, setToast] = useState<Toast>(null);
  const [nickname, setNickname] = useState<string>(COPY.settings.nicknameValue);
  const [timezone, setTimezone] = useState<string>(COPY.onboarding.timezonePacific);
  const [units, setUnits] = useState<string>(COPY.onboarding.unitOz);
  const [boundary, setBoundary] = useState<string>(COPY.settings.boundaryValue);

  return (
    <>
      <PageHeader eyebrow={COPY.settings.eyebrow} title={COPY.settings.title} intro={COPY.settings.intro} />
      <section className="settings-section">
        <h2>{COPY.settings.appearanceTitle}</h2>
        <Toggle checked={nursery} onChange={() => setNursery(!nursery)} label={COPY.settings.nurseryTheme} body={COPY.settings.nurseryBody} />
        <Toggle checked={reduced} onChange={() => setReduced(!reduced)} label={COPY.settings.motion} body={COPY.settings.motionBody} />
        <p className="panel-note"><Icon name="check" />{COPY.settings.appearanceSaved}</p>
      </section>
      <section className="settings-section">
        <Badge tone="preview">{COPY.global.preview}</Badge>
        <h2>{COPY.settings.profileTitle}</h2>
        <p>{COPY.settings.profilePreview}</p>
        <div className="settings-form">
          <label><span>{COPY.settings.nickname}</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} /></label>
          <label><span>{COPY.settings.timezone}</span><select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>{COPY.onboarding.timezonePacific}</option><option>{COPY.onboarding.timezoneEastern}</option><option>{COPY.onboarding.timezoneLondon}</option></select></label>
          <label><span>{COPY.settings.units}</span><select value={units} onChange={(event) => setUnits(event.target.value)}><option>{COPY.onboarding.unitOz}</option><option>{COPY.onboarding.unitMl}</option></select></label>
          <label><span>{COPY.settings.dayBoundary}</span><input value={boundary} onChange={(event) => setBoundary(event.target.value)} /></label>
        </div>
        <button className="button button--primary" type="button" onClick={() => setToast(COPY.settings.saved)}>{COPY.settings.save}</button>
      </section>
      <section className="settings-section install-section">
        <span><Icon name="download" /></span>
        <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.settings.installTitle}</h2><p>{COPY.settings.installBody}</p><button className="text-button" type="button" disabled>{COPY.settings.installHelp}</button></div>
      </section>
      <section className="future-grid">
        <article><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.settings.collaborationTitle}</h2><p>{COPY.settings.collaborationBody}</p></article>
        <article><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.settings.notificationsTitle}</h2><p>{COPY.settings.notificationsBody}</p></article>
      </section>
      <ToastMessage message={toast} onClose={() => setToast(null)} />
    </>
  );
}

export const Settings = SettingsPreview;
