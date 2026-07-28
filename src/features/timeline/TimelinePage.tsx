"use client";

import { useState } from "react";
import { COPY } from "@/src/copy";
import { Icon } from "@/src/components/Icon";
import { PageHeader, PreviewDisclosure } from "@/src/features/shared/ExperiencePrimitives";

export function Timeline() {
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
