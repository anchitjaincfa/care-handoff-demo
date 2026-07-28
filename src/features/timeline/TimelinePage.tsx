"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { ActionNotice, ConfirmDialog, PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";
import type { EventRowViewModel, TimelinePageProps } from "@/src/features/runtime/contracts";

const TIMELINE_FILTERS: readonly TimelinePageProps["filter"][] = ["all", "feed", "sleep", "diaper", "pumping", "solids", "tummy-time"];

function timelineFilterLabel(filter: TimelinePageProps["filter"]) {
  return filter === "all" ? COPY.live.allFilter : filter === "tummy-time" ? COPY.onboarding.tracking[5] : filter.charAt(0).toUpperCase() + filter.slice(1);
}

function TimelineEvent({ event, props, setTrigger, prepareDelete }: { event: EventRowViewModel; props: TimelinePageProps; setTrigger: (element: HTMLElement) => void; prepareDelete: () => void }) {
  return (
    <article className="timeline-event">
      <time>{event.timeLabel}</time><span className={`timeline-dot timeline-dot--${event.type}`} />
      <div><h3>{event.title}</h3><p>{event.detail}</p></div>
      <div className="timeline-actions">
        <button type="button" aria-label={COPY.global.edit} onClick={() => void props.onEdit(event.id)} disabled={!event.canEdit || props.phase === "pending"}><Icon name="edit" /></button>
        <button type="button" aria-label={COPY.global.delete} onClick={(click) => { prepareDelete(); setTrigger(click.currentTarget); void props.onDelete(event.id); }} disabled={!event.canDelete || props.phase === "pending"}><Icon name="trash" /></button>
      </div>
    </article>
  );
}

export function TimelineView(props: TimelinePageProps) {
  const [deleteTrigger, setDeleteTrigger] = useState<HTMLElement | null>(null);
  const [dismissedDelete, setDismissedDelete] = useState<string | null>(null);
  const pending = props.phase === "pending";
  return (
    <>
      <PageHeader eyebrow={COPY.timeline.eyebrow} title={COPY.timeline.title} intro={COPY.live.timelineIntro} />
      <ActionNotice phase={props.phase} />
      <div className="filter-row" role="group" aria-label={COPY.timeline.filterAria}>
        {TIMELINE_FILTERS.map((filter) => <button className={props.filter === filter ? "filter-chip filter-chip--active" : "filter-chip"} type="button" aria-pressed={props.filter === filter} onClick={() => void props.onFilterChange(filter)} disabled={pending} key={filter}>{timelineFilterLabel(filter)}</button>)}
      </div>
      {props.groups.length === 0 && <p className="empty-state">{COPY.live.noTimelineEntries}</p>}
      {props.groups.map((group) => <section className="timeline-day" key={group.id}><header><h2>{group.heading}</h2></header>{group.events.map((event) => <TimelineEvent event={event} props={props} setTrigger={setDeleteTrigger} prepareDelete={() => setDismissedDelete(null)} key={event.id} />)}</section>)}
      {props.editing && (
        <section className="review-card" role="dialog" aria-modal="true" aria-labelledby="timeline-edit-title">
          <h2 id="timeline-edit-title">{COPY.live.timelineEdit}</h2>
          <div className="review-fields">
            {Object.entries(props.editing.fields).map(([key, value]) => <label key={key}><span>{key}</span><input value={String(value ?? "")} onChange={(event) => void props.onEditChange({ ...props.editing!.fields, [key]: event.target.value })} /></label>)}
          </div>
          <div className="button-row"><button className="button button--ghost" type="button" onClick={() => void props.onCancelEdit()}>{COPY.global.cancel}</button><button className="button button--primary" type="button" onClick={() => void props.onSaveEdit()} disabled={pending}>{COPY.live.timelineSave}</button></div>
        </section>
      )}
      <ConfirmDialog open={props.deletingId !== null && props.deletingId !== dismissedDelete} trigger={deleteTrigger} title={COPY.live.timelineDeleteTitle} body={COPY.live.timelineDeleteBody} confirmLabel={COPY.live.timelineDeleteConfirm} danger onCancel={() => setDismissedDelete(props.deletingId)} onConfirm={() => void props.onConfirmDelete()} />
      {props.canUndo && <button className="button button--ghost" type="button" onClick={() => void props.onUndo()} disabled={pending}><Icon name="arrow" />{COPY.live.undoLast}</button>}
    </>
  );
}

export function TimelinePreview() {
  const [filter, setFilter] = useState("All");
  const matches = (category: string) => filter === "All" || category === filter;
  const current = COPY.timeline.events.filter((event) => matches(event.category));
  const older = COPY.timeline.olderEvents.filter((event) => matches(event.category));
  const renderEvent = (event: { category: string; time: string; title: string; detail: string }) => (
    <article className="timeline-event" key={event.time + event.title}>
      <time>{event.time}</time>
      <span className={`timeline-dot timeline-dot--${event.category.toLowerCase()}`} />
      <div><h3>{event.title}</h3><p>{event.detail}</p></div>
      <div className="timeline-actions"><button type="button" aria-label={COPY.timeline.editEntry} title={COPY.timeline.editEntry} disabled><Icon name="edit" /></button><button type="button" aria-label={COPY.timeline.deleteEntry} title={COPY.timeline.deleteEntry} disabled><Icon name="trash" /></button></div>
    </article>
  );
  return (
    <>
      <PageHeader eyebrow={COPY.timeline.eyebrow} title={COPY.timeline.title} intro={COPY.timeline.intro} />
      <PreviewDisclosure>{COPY.timeline.sampleDisclosure}</PreviewDisclosure>
      <div className="filter-row" role="group" aria-label={COPY.timeline.filterAria}>
        {COPY.timeline.filters.map((item) => <button className={filter === item ? "filter-chip filter-chip--active" : "filter-chip"} type="button" onClick={() => setFilter(item)} key={item}>{item}</button>)}
      </div>
      <section className="timeline-day"><header><h2>{COPY.timeline.today}</h2></header>{current.length ? current.map(renderEvent) : <p className="empty-state">{COPY.timeline.empty}</p>}</section>
      {older.length > 0 && <section className="timeline-day"><header><h2>{COPY.timeline.yesterday}</h2></header>{older.map(renderEvent)}</section>}
    </>
  );
}

export const Timeline = TimelinePreview;
