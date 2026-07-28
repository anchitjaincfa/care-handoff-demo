"use client";

import { useEffect, useState } from "react";
import { COPY } from "@/src/copy";
import { Icon, type IconName } from "@/src/components/Icon";
import { ActionNotice, Badge, ConfirmDialog, PageHeader, PreviewDisclosure, ToastMessage, type Toast } from "@/src/features/shared/ExperiencePrimitives";
import type { EventRowViewModel, QuickLogKind, TodayPageProps } from "@/src/features/runtime/contracts";

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
  return kind === "tummy-time" ? COPY.onboarding.tracking[5] : kind.charAt(0).toUpperCase() + kind.slice(1);
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

export function TodayView(props: TodayPageProps) {
  const [reviewing, setReviewing] = useState<QuickLogKind | null>(null);
  const pending = props.phase === "pending";
  const confirmQuick = () => {
    if (!reviewing) return;
    void props.onQuickLog(reviewing);
    setReviewing(null);
  };
  return (
    <>
      {props.mode === "demo" && <div className="demo-banner"><Badge tone="demo">{COPY.global.demo}</Badge><span>{COPY.demo.banner}</span></div>}
      <PageHeader eyebrow={props.dateLabel || COPY.live.todayDate} title={props.title} intro={props.dayBoundaryLabel} actions={<a className="button button--primary" href={props.mode === "demo" ? "/demo/#capture" : "/capture/"}><Icon name="plus" />{COPY.today.addEntry}</a>} />
      <ActionNotice phase={props.phase} />
      <section className="panel quick-panel" aria-busy={pending}>
        <div className="panel-heading"><div><h2>{COPY.today.quickTitle}</h2><p>{COPY.today.quickHint}</p></div></div>
        <div className="quick-grid">
          {props.quickActions.map((kind) => (
            <button className="quick-action" type="button" key={kind} onClick={() => setReviewing(kind)} disabled={pending}>
              <span className={`event-icon event-icon--${kind}`}><Icon name={QUICK_ICONS[kind]} /></span>
              <span><strong>{quickLabel(kind)}</strong><small>{COPY.live.quickReviewBody}</small></span><Icon name="plus" />
            </button>
          ))}
        </div>
        <div className="button-row">
          <button className="button button--soft" type="button" onClick={() => void props.onStartTimer("feed")} disabled={pending}><Icon name="bottle" />{COPY.live.timerStart}</button>
          <button className="button button--soft" type="button" onClick={() => void props.onStartTimer("sleep")} disabled={pending}><Icon name="moon" />{COPY.live.timerStart}</button>
        </div>
      </section>
      <ConfirmDialog open={reviewing !== null} title={COPY.live.quickReviewTitle} body={reviewing ? quickLabel(reviewing) : COPY.live.quickReviewBody} confirmLabel={COPY.live.quickConfirm} onCancel={() => setReviewing(null)} onConfirm={confirmQuick} />
      <section className="panel">
        <div className="panel-heading"><h2>{COPY.today.activeTitle}</h2>{props.activeTimers.length > 0 && <span className="count-pill">{props.activeTimers.length}</span>}</div>
        {props.activeTimers.length > 0 ? props.activeTimers.map((timer) => <LiveTimer timer={timer} onStop={props.onStopTimer} key={timer.id} />) : <p className="empty-state">{COPY.live.timerNoActive}</p>}
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>{COPY.today.recentTitle}</h2><a href={props.mode === "demo" ? "/demo/#timeline" : "/timeline/"}>{COPY.today.viewTimeline}<Icon name="chevron" /></a></div>
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
