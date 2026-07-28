"use client";

import { COPY } from "@/src/copy";
import { Icon, type IconName } from "@/src/components/Icon";
import { Badge, Brand, PageHeader } from "@/src/features/shared/ExperiencePrimitives";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Brand />
      <nav className="public-header__nav" aria-label={COPY.nav.publicAria}>
        <a href="/status/">{COPY.nav.status}</a>
        <a href="/privacy/">{COPY.nav.privacy}</a>
        <a className="button button--small button--dark" href="/demo/">{COPY.nav.demo}</a>
      </nav>
    </header>
  );
}

export function Home() {
  return (
    <div className="landing">
      <a className="skip-link" href="#main">{COPY.global.skipToContent}</a>
      <PublicHeader />
      <main id="main">
        <section className="hero">
          <div className="hero__glow hero__glow--one" />
          <div className="hero__glow hero__glow--two" />
          <div className="hero__copy">
            <p className="eyebrow">{COPY.home.eyebrow}</p>
            <h1>{COPY.home.title}</h1>
            <p className="lede">{COPY.home.intro}</p>
            <div className="button-row">
              <a className="button button--primary" href="/onboarding/">{COPY.home.primaryCta}<Icon name="arrow" /></a>
              <a className="button button--ghost" href="/demo/">{COPY.home.secondaryCta}</a>
            </div>
            <p className="microcopy"><Icon name="lock" />{COPY.home.privacyNote}</p>
          </div>
          <div className="hero-card" role="img" aria-label={COPY.home.samplePreviewAlt}>
            <span className="hero-card__sample"><Badge tone="preview">{COPY.home.samplePreview}</Badge></span>
            <div className="hero-card__top">
              <span className="avatar">{COPY.home.mockAvatar}</span>
              <span className="hero-card__lines"><i /><i /></span>
              <span className="pulse-dot" />
            </div>
            <div className="hero-card__timer">
              <span className="event-icon event-icon--sleep"><Icon name="moon" /></span>
              <span className="hero-card__timer-copy"><i /><i /></span>
              <strong>{COPY.home.mockTimer}</strong>
            </div>
            <div className="hero-card__event"><span className="event-icon event-icon--feed"><Icon name="bottle" /></span><span><i /><i /></span><b /></div>
            <div className="hero-card__event"><span className="event-icon event-icon--diaper"><Icon name="drop" /></span><span><i /><i /></span><b /></div>
            <div className="hero-card__confirm"><Icon name="check" /></div>
          </div>
        </section>

        <section className="trust-grid" aria-label={COPY.home.eyebrow}>
          {[
            [COPY.home.trustOneTitle, COPY.home.trustOneBody, "check" as IconName],
            [COPY.home.trustTwoTitle, COPY.home.trustTwoBody, "handoff" as IconName],
            [COPY.home.trustThreeTitle, COPY.home.trustThreeBody, "shield" as IconName],
          ].map(([title, body, icon]) => (
            <article className="trust-card" key={title}>
              <span className="trust-card__icon"><Icon name={icon as IconName} /></span>
              <h2>{title}</h2>
              <p>{body}</p>
            </article>
          ))}
        </section>

        <section className="flow-section">
          <div className="section-heading">
            <p className="eyebrow">{COPY.home.flowEyebrow}</p>
            <h2>{COPY.home.flowTitle}</h2>
          </div>
          <div className="flow-steps">
            {COPY.home.flowSteps.map((step) => (
              <article className="flow-step" key={step.number}>
                <span>{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="boundary-note"><Icon name="info" /><p>{COPY.home.disclosure}</p></aside>
      </main>
      <footer className="public-footer"><Brand compact /><span>{COPY.global.codenameDisclaimer}</span></footer>
    </div>
  );
}

export function Status() {
  return (
    <>
      <PageHeader eyebrow={COPY.status.eyebrow} title={COPY.status.title} intro={COPY.status.intro} />
      <div className="status-stack">
        <section className="status-section"><header><Badge tone="live">{COPY.global.live}</Badge><div><h2>{COPY.status.liveTitle}</h2><p>{COPY.status.liveBody}</p></div></header><ul>{COPY.status.liveItems.map((item) => <li key={item}><Icon name="check" />{item}</li>)}</ul></section>
        <section className="status-section"><header><Badge tone="demo">{COPY.global.demo}</Badge><div><h2>{COPY.status.demoTitle}</h2><p>{COPY.status.demoBody}</p></div></header><ul>{COPY.status.demoItems.map((item) => <li key={item}><Icon name="spark" />{item}</li>)}</ul></section>
        <section className="status-section"><header><Badge tone="planned">{COPY.global.planned}</Badge><div><h2>{COPY.status.plannedTitle}</h2></div></header><div className="status-item-grid">{COPY.status.plannedItems.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
        <section className="status-section status-section--excluded"><header><Badge tone="excluded">{COPY.global.excluded}</Badge><div><h2>{COPY.status.excludedTitle}</h2></div></header><div className="status-item-grid">{COPY.status.excludedItems.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.body}</p></article>)}</div></section>
      </div>
    </>
  );
}
