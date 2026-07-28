"use client";

import { useEffect, useId, useState } from "react";
import { COPY } from "@/src/copy";
import { Icon, type IconName } from "@/src/components/Icon";
import { ActionNotice, Badge, ConfirmDialog, PageHeader, PreviewDisclosure, ToastMessage, type Toast } from "@/src/features/shared/ExperiencePrimitives";
import type { EventRowViewModel, ManualQuickLogDraft, QuickLogKind, TodayPageProps } from "@/src/features/runtime/contracts";

const QUICK_ICONS: Record<QuickLogKind, IconName> = {
  bottle: "bottle", nursing: "heart", diaper: "drop", sleep: "moon",
  pumping: "drop", solids: "sun", "tummy-time": "spark",
};

function eventIcon(type: EventRowViewModel["type"]): IconName {
  if (type === "sleep") return "moon";
  if (type === "diaper") return "drop";
  if (type === "feed") return "bottle";
  return type === "tummy-time" ? "spark" : type === "solids" ? "sun" : "heart";
}

function quickLabel(kind: QuickLogKind) {
  return COPY.live.quickLabels[kind];
}

function positiveNumber(raw: string): number | null {
  const value = Number(raw);
  return raw.trim() && Number.isFinite(value) && value > 0 ? value : null;
}

function initialQuickDraft(kind: QuickLogKind, unit: TodayPageProps["volumeUnit"]): ManualQuickLogDraft | null {
  if (kind === "bottle") return { kind, volume: null, unit };
  if (kind === "diaper") return { kind, diaperKind: null };
  if (kind === "pumping") return { kind, durationMinutes: null, volume: null, unit };
  if (kind === "solids") return { kind, food: "" };
  if (kind === "tummy-time") return { kind, durationMinutes: null };
  return null;
}

function completeQuickDraft(draft: ManualQuickLogDraft): boolean {
  if (draft.kind === "bottle") return draft.volume !== null;
  if (draft.kind === "diaper") return draft.diaperKind !== null;
  if (draft.kind === "pumping") return draft.durationMinutes !== null && draft.volume !== null;
  if (draft.kind === "solids") return Boolean(draft.food.trim());
  return draft.durationMinutes !== null;
}

function QuickLogReviewFields({ draft, onChange }: { draft: ManualQuickLogDraft; onChange: (draft: ManualQuickLogDraft) => void }) {
  const id = useId();
  if (draft.kind === "bottle") return (
    <div className="review-fields">
      <label htmlFor={`${id}-volume`}><span>{COPY.live.quickVolume}</span><input id={`${id}-volume`} type="number" inputMode="decimal" min="0.1" step="any" required aria-invalid={draft.volume === null} value={draft.volume ?? ""} onChange={(event) => onChange({ ...draft, volume: positiveNumber(event.target.value) })} /></label>
      <label htmlFor={`${id}-unit`}><span>{COPY.live.quickUnit}</span><select id={`${id}-unit`} value={draft.unit} onChange={(event) => onChange({ ...draft, unit: event.target.value as "oz" | "ml" })}><option value="oz">{COPY.onboarding.unitOz}</option><option value="ml">{COPY.onboarding.unitMl}</option></select></label>
    </div>
  );
  if (draft.kind === "diaper") return (
    <div className="review-fields"><label htmlFor={`${id}-kind`}><span>{COPY.live.quickDiaperKind}</span><select id={`${id}-kind`} required aria-invalid={draft.diaperKind === null} value={draft.diaperKind ?? ""} onChange={(event) => onChange({ ...draft, diaperKind: (event.target.value || null) as typeof draft.diaperKind })}><option value="">{COPY.live.quickChooseDiaperKind}</option><option value="wet">Wet</option><option value="dirty">Dirty</option><option value="both">Both</option><option value="dry">Dry</option></select></label></div>
  );
  if (draft.kind === "pumping") return (
    <div className="review-fields">
      <label htmlFor={`${id}-duration`}><span>{COPY.live.quickPumpDuration}</span><input id={`${id}-duration`} type="number" inputMode="decimal" min="1" step="1" required aria-invalid={draft.durationMinutes === null} value={draft.durationMinutes ?? ""} onChange={(event) => onChange({ ...draft, durationMinutes: positiveNumber(event.target.value) })} /></label>
      <label htmlFor={`${id}-volume`}><span>{COPY.live.quickPumpVolume}</span><input id={`${id}-volume`} type="number" inputMode="decimal" min="0.1" step="any" required aria-invalid={draft.volume === null} value={draft.volume ?? ""} onChange={(event) => onChange({ ...draft, volume: positiveNumber(event.target.value) })} /></label>
      <label htmlFor={`${id}-unit`}><span>{COPY.live.quickUnit}</span><select id={`${id}-unit`} value={draft.unit} onChange={(event) => onChange({ ...draft, unit: event.target.value as "oz" | "ml" })}><option value="oz">{COPY.onboarding.unitOz}</option><option value="ml">{COPY.onboarding.unitMl}</option></select></label>
    </div>
  );
  if (draft.kind === "solids") return (
    <div className="review-fields"><label htmlFor={`${id}-food`}><span>{COPY.live.quickFood}</span><input id={`${id}-food`} type="text" maxLength={120} required aria-invalid={!draft.food.trim()} value={draft.food} onChange={(event) => onChange({ ...draft, food: event.target.value })} /></label></div>
  );
  return (
    <div className="review-fields"><label htmlFor={`${id}-duration`}><span>{COPY.live.quickTummyDuration}</span><input id={`${id}-duration`} type="number" inputMode="decimal" min="1" step="1" required aria-invalid={draft.durationMinutes === null} value={draft.durationMinutes ?? ""} onChange={(event) => onChange({ ...draft, durationMinutes: positiveNumber(event.target.value) })} /></label></div>
  );
}

function LiveTimer({ timer, onStop }: { timer: TodayPageProps["activeTimers"][number]; onStop: TodayPageProps["onStopTimer"] }) {
  const [label, setLabel] = useState(timer.elapsedLabel);
  useEffect(() => {
    const update = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - timer.startedAtEpochMs) / 1000));
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const rest = seconds % 60;
      setLabel(hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}` : `${minutes}:${String(rest).padStart(2, "0")}`);
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [timer.startedAtEpochMs]);
  return (
    <article className="active-timer" aria-busy={timer.pending}>
      <span className={`event-icon event-icon--${timer.type}`}><Icon name={timer.type === "sleep" ? "moon" : "bottle"} /></span>
      <div><h3>{timer.title}</h3><p>{timer.startedLabel}</p></div>
      <strong aria-live="off">{label}</strong>
      <button className="button button--soft" type="button" onClick={() => void onStop(timer.id)} disabled={timer.pending}>{COPY.live.timerStop}</button>
    </article>
  );
}

type TodayReview =
  | { type: "quick"; draft: ManualQuickLogDraft; trigger: HTMLButtonElement }
  | { type: "timer"; kind: "feed" | "sleep"; trigger: HTMLButtonElement };

export function TodayView(props: TodayPageProps) {
  const [reviewing, setReviewing] = useState<TodayReview | null>(null);
  const pending = props.phase === "pending";
  const beginReview = (kind: QuickLogKind, trigger: HTMLButtonElement) => {
    if (kind === "nursing" || kind === "sleep") {
      setReviewing({ type: "timer", kind: kind === "nursing" ? "feed" : "sleep", trigger });
      return;
    }
    const draft = initialQuickDraft(kind, props.volumeUnit);
    if (draft) setReviewing({ type: "quick", draft, trigger });
  };
  const confirmReview = () => {
    if (!reviewing) return;
    if (reviewing.type === "quick") {
      if (!completeQuickDraft(reviewing.draft)) return;
      void props.onQuickLog(reviewing.draft);
    } else void props.onStartTimer(reviewing.kind);
    setReviewing(null);
  };
  const updateQuickDraft = (draft: ManualQuickLogDraft) => setReviewing((current) => current?.type === "quick" ? { ...current, draft } : current);
  const quickReview = reviewing?.type === "quick" ? reviewing : null;
  return (
    <>
      {props.mode === "demo" && <div className="demo-banner"><Badge tone="demo">{COPY.global.demo}</Badge><span>{COPY.demo.banner}</span></div>}
      <PageHeader eyebrow={props.dateLabel || COPY.live.dateUnavailable} title={props.title} intro={props.dayBoundaryLabel} actions={<a className="button button--primary" href={props.mode === "demo" ? "/demo/?surface=capture" : "/capture/"}><Icon name="plus" />{COPY.today.addEntry}</a>} />
      <ActionNotice phase={props.phase} />
      <section className="panel quick-panel" aria-busy={pending}>
        <div className="panel-heading"><div><h2>{COPY.today.quickTitle}</h2><p>{COPY.today.quickHint}</p></div></div>
        <div className="quick-grid">
          {props.quickActions.map((kind) => (
            <button className="quick-action" type="button" key={kind} onClick={(event) => beginReview(kind, event.currentTarget)} disabled={pending}>
              <span className={`event-icon event-icon--${kind}`}><Icon name={QUICK_ICONS[kind]} /></span>
              <span><strong>{quickLabel(kind)}</strong><small>{kind === "nursing" || kind === "sleep" ? COPY.live.timerReviewTitle : COPY.live.quickReviewBody}</small></span><Icon name="plus" />
            </button>
          ))}
        </div>
        <div className="button-row">
          <button className="button button--soft" type="button" onClick={(event) => setReviewing({ type: "timer", kind: "feed", trigger: event.currentTarget })} disabled={pending}><Icon name="bottle" />{COPY.live.timerStartFeed}</button>
          <button className="button button--soft" type="button" onClick={(event) => setReviewing({ type: "timer", kind: "sleep", trigger: event.currentTarget })} disabled={pending}><Icon name="moon" />{COPY.live.timerStartSleep}</button>
        </div>
      </section>
      <ConfirmDialog
        open={reviewing !== null}
        title={reviewing?.type === "timer" ? COPY.live.timerReviewTitle : COPY.live.quickReviewTitle}
        body={reviewing?.type === "timer" ? (reviewing.kind === "feed" ? COPY.live.timerReviewFeedBody : COPY.live.timerReviewSleepBody) : reviewing ? `${quickLabel(reviewing.draft.kind)} — ${COPY.live.quickReviewBody}` : COPY.live.quickReviewBody}
        confirmLabel={reviewing?.type === "timer" ? COPY.live.timerConfirm : COPY.live.quickConfirm}
        confirmDisabled={Boolean(quickReview && !completeQuickDraft(quickReview.draft))}
        trigger={reviewing?.trigger}
        onCancel={() => setReviewing(null)}
        onConfirm={confirmReview}
      >
        {quickReview && <div><p className="microcopy">{COPY.live.quickFieldsFinal}</p><QuickLogReviewFields draft={quickReview.draft} onChange={updateQuickDraft} /></div>}
      </ConfirmDialog>
      <section className="panel">
        <div className="panel-heading"><h2>{COPY.today.activeTitle}</h2>{props.activeTimers.length > 0 && <span className="count-pill">{props.activeTimers.length}</span>}</div>
        {props.activeTimers.length > 0 ? props.activeTimers.map((timer) => <LiveTimer timer={timer} onStop={props.onStopTimer} key={timer.id} />) : <p className="empty-state">{COPY.live.timerNoActive}</p>}
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>{COPY.live.recentCareTitle}</h2><a href={props.mode === "demo" ? "/demo/?surface=timeline" : "/timeline/"}>{COPY.today.viewTimeline}<Icon name="chevron" /></a></div>
        <div className="event-list">
          {props.recentEvents.map((event) => (
            <article className="event-row" key={event.id}>
              <time>{event.timeLabel}</time><span className={`event-icon event-icon--${event.type}`}><Icon name={eventIcon(event.type)} /></span>
              <div><h3>{event.title}</h3><p>{event.detail}</p></div>
            </article>
          ))}
        </div>
        <p className="panel-note"><Icon name="info" />{props.dayBoundaryLabel}</p>
      </section>
      {props.canUndo && <button className="button button--ghost" type="button" onClick={() => void props.onUndo()} disabled={pending}><Icon name="arrow" />{COPY.live.undoLast}</button>}
    </>
  );
}

export function TodayPreview({ demo = false }: { demo?: boolean }) {
  const [toast, setToast] = useState<Toast>(null);
  const [timerActive, setTimerActive] = useState(true);
  const quickIcons: IconName[] = ["bottle", "heart", "drop", "moon", "sun", "spark"];
  return (
    <>
      {demo && <div className="demo-banner"><Badge tone="demo">{COPY.global.demo}</Badge><span>{COPY.demo.banner}</span></div>}
      <PageHeader
        eyebrow={COPY.today.greeting}
        title={demo ? COPY.demo.title : COPY.today.title}
        intro={demo ? COPY.demo.subhead : COPY.today.subhead}
        actions={<a className="button button--primary" href={demo ? "/demo/#capture" : "/capture/"}><Icon name="plus" />{COPY.today.addEntry}</a>}
      />
      {!demo && <PreviewDisclosure>{COPY.today.sampleDisclosure}</PreviewDisclosure>}
      <section className="panel quick-panel">
        <div className="panel-heading"><div><h2>{COPY.today.quickTitle}</h2><p>{COPY.today.quickHint}</p></div></div>
        <div className="quick-grid">
          {COPY.today.quickActions.map((action, index) => (
            <button className="quick-action" type="button" key={action.key} onClick={() => setToast(`${COPY.today.loggedPrefix} ${action.label.toLowerCase()}. ${COPY.today.logToast}`)}>
              <span className={`event-icon event-icon--${action.key}`}><Icon name={quickIcons[index] ?? "plus"} /></span>
              <span><strong>{action.label}</strong><small>{action.meta}</small></span>
              <Icon name="plus" />
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>{COPY.today.activeTitle}</h2>
          {timerActive && <span className="count-pill">{COPY.today.activeCount}</span>}
        </div>
        {timerActive ? (
          <article className="active-timer">
            <span className="event-icon event-icon--sleep"><Icon name="moon" /></span>
            <div><h3>{COPY.today.sleepTimer}</h3><p>{COPY.today.sleepSince}</p></div>
            <strong>{COPY.today.timerValue}</strong>
            <button className="button button--soft" type="button" onClick={() => { setTimerActive(false); setToast(COPY.today.timerStopped); }}>{COPY.today.stopTimer}</button>
          </article>
        ) : <p className="empty-state">{COPY.today.timerStopped}</p>}
      </section>

      <section className="panel">
        <div className="panel-heading"><h2>{COPY.today.recentTitle}</h2><a href={demo ? "/demo/#timeline" : "/timeline/"}>{COPY.today.viewTimeline}<Icon name="chevron" /></a></div>
        <div className="event-list">
          {COPY.today.events.map((event) => (
            <article className="event-row" key={event.time + event.title}>
              <time>{event.time}</time>
              <span className={`event-icon event-icon--${event.tone}`}><Icon name={event.tone === "sleep" ? "moon" : event.tone === "feed" ? "bottle" : "drop"} /></span>
              <div><h3>{event.title}</h3><p>{event.detail}</p></div>
              <button className="icon-button row-menu" type="button" aria-label={COPY.global.menuPlanned} title={COPY.global.menuPlanned} disabled><span aria-hidden="true">{COPY.global.menuGlyph}</span></button>
            </article>
          ))}
        </div>
        <p className="panel-note"><Icon name="info" />{COPY.today.dayNote}</p>
      </section>
      <ToastMessage message={toast} onClose={() => setToast(null)} />
    </>
  );
}

export const Today = TodayPreview;
