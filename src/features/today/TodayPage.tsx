"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon, type IconName } from "@/src/components/Icon";
import { Badge, PageHeader, PreviewDisclosure, ToastMessage, type Toast } from "@/src/features/shared/ExperiencePrimitives";

export function Today({ demo = false }: { demo?: boolean }) {
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
        actions={<a className="button button--primary" href="/capture/"><Icon name="plus" />{COPY.today.addEntry}</a>}
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
        <div className="panel-heading"><h2>{COPY.today.recentTitle}</h2><a href="/timeline/">{COPY.today.viewTimeline}<Icon name="chevron" /></a></div>
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
