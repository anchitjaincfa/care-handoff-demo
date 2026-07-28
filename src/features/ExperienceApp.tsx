"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { COPY, type ExperiencePage } from "@/src/copy";
import { Icon, type IconName } from "@/src/components/Icon";

type BadgeTone = "live" | "demo" | "preview" | "planned" | "excluded";
type Toast = string | null;
type PersistenceState = "idle" | "requesting" | "granted" | "denied" | "unavailable";
type PassState = "demo" | "invalid" | "expired";

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

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

const PLACEHOLDER_PASS_HASHES = {
  invalid: "#invalid",
  expired: "#expired",
} as const;

/**
 * TODO(integration): Replace this placeholder hash reader with the handoff-codec
 * adapter. Keep PassState as the view boundary so invalid and expired payloads
 * remain explicit states rather than falling through to demo content.
 */
function readPassState(): PassState {
  if (window.location.hash === PLACEHOLDER_PASS_HASHES.invalid) return "invalid";
  if (window.location.hash === PLACEHOLDER_PASS_HASHES.expired) return "expired";
  return "demo";
}

function readDemoPassState(): PassState {
  return "demo";
}

const primaryNav: { href: string; label: string; icon: IconName; page: ExperiencePage }[] = [
  { href: "/today/", label: COPY.nav.today, icon: "home", page: "today" },
  { href: "/capture/", label: COPY.nav.capture, icon: "plus", page: "capture" },
  { href: "/timeline/", label: COPY.nav.timeline, icon: "clock", page: "timeline" },
  { href: "/insights/", label: COPY.nav.insights, icon: "spark", page: "insights" },
  { href: "/handoff/", label: COPY.nav.handoff, icon: "handoff", page: "handoff" },
];

const secondaryNav: { href: string; label: string; icon: IconName; page: ExperiencePage }[] = [
  { href: "/privacy/", label: COPY.nav.privacy, icon: "shield", page: "privacy" },
  { href: "/settings/", label: COPY.nav.settings, icon: "settings", page: "settings" },
];

function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}><span className="badge__dot" aria-hidden="true" />{children}</span>;
}

function ConfidenceChip({ attention = false }: { attention?: boolean }) {
  return <span className={attention ? "confidence-chip confidence-chip--attention" : "confidence-chip"}><Icon name={attention ? "info" : "check"} />{attention ? COPY.capture.uncertain : COPY.capture.confident}</span>;
}

function PreviewDisclosure({ children }: { children: React.ReactNode }) {
  return <aside className="preview-disclosure"><Badge tone="preview">{COPY.global.preview}</Badge><p>{children}</p></aside>;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={compact ? "brand brand--compact" : "brand"} href="/" aria-label={COPY.nav.home}>
      <span className="brand__mark" aria-hidden="true"><span /><span /></span>
      <span className="brand__name">{COPY.global.product}</span>
    </Link>
  );
}

function ToastMessage({ message, onClose }: { message: Toast; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      <span className="toast__check"><Icon name="check" /></span>
      <span>{message}</span>
      <button className="icon-button" type="button" onClick={onClose} aria-label={COPY.global.close}><span aria-hidden="true">{COPY.global.closeGlyph}</span></button>
    </div>
  );
}

function PublicHeader() {
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

function Home() {
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

function AppNavigation({ page, demo }: { page: ExperiencePage; demo: boolean }) {
  return (
    <>
      <aside className="side-rail">
        <div>
          <Brand />
          {demo && <Badge tone="demo">{COPY.global.demo}</Badge>}
        </div>
        <nav aria-label={COPY.nav.primaryAria}>
          {primaryNav.map((item) => (
            <a className={item.page === page ? "nav-link nav-link--active" : "nav-link"} href={item.href} aria-current={item.page === page ? "page" : undefined} key={item.page}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </a>
          ))}
        </nav>
        <nav className="side-rail__secondary" aria-label={COPY.nav.secondaryAria}>
          {secondaryNav.map((item) => (
            <a className={item.page === page ? "nav-link nav-link--active" : "nav-link"} href={item.href} aria-current={item.page === page ? "page" : undefined} key={item.page}>
              <Icon name={item.icon} /><span>{item.label}</span>
            </a>
          ))}
          <a className="demo-link" href={demo ? "/today/" : "/demo/"}>{demo ? COPY.demo.switch : COPY.nav.demo}<Icon name="chevron" /></a>
        </nav>
      </aside>
      <nav className="bottom-nav" aria-label={COPY.nav.mobileAria}>
        {primaryNav.map((item) => (
          <a className={item.page === page ? "bottom-nav__item bottom-nav__item--active" : "bottom-nav__item"} href={item.href} aria-current={item.page === page ? "page" : undefined} key={item.page}>
            <Icon name={item.icon} /><span>{item.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}

function PageHeader({ eyebrow, title, intro, actions }: { eyebrow: string; title: string; intro?: string; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

function Today({ demo = false }: { demo?: boolean }) {
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

function Onboarding() {
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

function Capture() {
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

function Timeline() {
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

function Insights() {
  const [evidence, setEvidence] = useState(false);
  return (
    <>
      <PageHeader eyebrow={COPY.insights.eyebrow} title={COPY.insights.title} intro={COPY.insights.intro} />
      <PreviewDisclosure>{COPY.insights.sampleDisclosure}</PreviewDisclosure>
      <section className="forming-card">
        <div className="forming-card__icon"><Icon name="spark" /></div>
        <div><h2>{COPY.insights.formingTitle}</h2><p>{COPY.insights.formingBody}</p><div className="sample-progress"><span style={{ width: "67%" }} /></div><small>{COPY.insights.evidence}</small></div>
      </section>
      <section>
        <div className="panel-heading"><h2>{COPY.insights.sevenDay}</h2><Badge tone="preview">{COPY.global.preview}</Badge></div>
        <div className="summary-grid">{COPY.insights.summaryCards.map((card) => <article className="summary-card" key={card.label}><strong>{card.value}</strong><h3>{card.label}</h3><p>{card.note}</p></article>)}</div>
      </section>
      <section className="insight-preview">
        <header><Badge tone="preview">{COPY.insights.previewBadge}</Badge><h2>{COPY.insights.previewTitle}</h2><p>{COPY.insights.previewBody}</p></header>
        <div className="range-plot">
          <span className="range-plot__label">{COPY.insights.rangeLabel}</span>
          <div className="range-plot__bar"><i /><b /></div>
          <div className="range-plot__times"><span>{COPY.insights.rangeStart}</span><span>{COPY.insights.rangeEnd}</span></div>
          <small>{COPY.insights.sampleCount}</small>
        </div>
        <article className="prediction-card"><span className="event-icon event-icon--feed"><Icon name="bottle" /></span><div><h3>{COPY.insights.predictedTitle}</h3><p>{COPY.insights.predictedBody}</p><small>{COPY.insights.predictionCaveat}</small></div></article>
        <button className="evidence-button" type="button" onClick={() => setEvidence((value) => !value)}>{evidence ? COPY.insights.hideEvidence : COPY.insights.showEvidence}<Icon name="chevron" /></button>
        {evidence && <p className="evidence-detail">{COPY.insights.evidenceDetail}</p>}
      </section>
    </>
  );
}

function Handoff() {
  const [stage, setStage] = useState<"edit" | "warning" | "ready">("edit");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/pass/#demo");
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };
  return (
    <>
      <PageHeader eyebrow={COPY.handoff.eyebrow} title={COPY.handoff.title} intro={COPY.handoff.intro} />
      <PreviewDisclosure>{COPY.handoff.sampleDisclosure}</PreviewDisclosure>
      {stage === "edit" && (
        <section className="handoff-layout">
          <label className="select-block"><span>{COPY.handoff.boundaryLabel}</span><select>{COPY.handoff.boundaryOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <article className="brief-card">
            <header><div><h2>{COPY.handoff.briefTitle}</h2><p>{COPY.handoff.editableHint}</p></div><Badge tone="preview">{COPY.global.preview}</Badge></header>
            <strong className="brief-summary">{COPY.handoff.summary}</strong>
            <div className="brief-section"><h3>{COPY.handoff.openTitle}</h3><p>{COPY.handoff.openBody}</p></div>
            <div className="brief-section"><h3>{COPY.handoff.recentTitle}</h3><ul>{COPY.handoff.recentItems.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <label><span>{COPY.handoff.noteLabel}</span><textarea rows={3} placeholder={COPY.handoff.notePlaceholder} /></label>
          </article>
          <button className="button button--primary button--wide" type="button" onClick={() => setStage("warning")}>{COPY.handoff.generate}<Icon name="arrow" /></button>
        </section>
      )}
      {stage === "warning" && (
        <section className="warning-card">
          <span className="warning-card__icon"><Icon name="handoff" /></span>
          <h2>{COPY.handoff.warningTitle}</h2>
          <p>{COPY.handoff.warningBody}</p>
          <ul><li><Icon name="info" />{COPY.handoff.warningHistory}</li><li><Icon name="clock" />{COPY.handoff.warningExpiry}</li></ul>
          <div className="button-row"><button className="button button--primary" type="button" onClick={() => setStage("ready")}>{COPY.handoff.agree}</button><button className="button button--ghost" type="button" onClick={() => setStage("edit")}>{COPY.global.back}</button></div>
        </section>
      )}
      {stage === "ready" && (
        <section className="qr-card">
          <h2>{COPY.handoff.qrTitle}</h2>
          <div className="pass-placeholder-tile" role="img" aria-label={COPY.handoff.qrAlt}>{Array.from({ length: 81 }, (_, index) => <i className={index % 3 === 0 || index % 7 === 0 || [1, 9, 63, 71].includes(index) ? "is-dark" : ""} key={index} />)}</div>
          <p>{COPY.handoff.qrHint}</p>
          <span className="expiry-pill"><Icon name="clock" />{COPY.handoff.expires}</span>
          <small>{COPY.handoff.size}</small>
          <div className="button-row"><button className="button button--soft" type="button" onClick={copyLink}>{copyState === "copied" ? COPY.handoff.copied : copyState === "unavailable" ? COPY.handoff.copyUnavailable : COPY.handoff.copyLink}</button><button className="button button--ghost" type="button" disabled>{COPY.handoff.print}</button></div>
          <button className="text-button" type="button" onClick={() => setStage("edit")}>{COPY.handoff.rebuild}</button>
        </section>
      )}
    </>
  );
}

function Privacy() {
  const [persistence, setPersistence] = useState<PersistenceState>("idle");

  const requestPersistence = async () => {
    if (!navigator.storage?.persist) {
      setPersistence("unavailable");
      return;
    }
    setPersistence("requesting");
    try {
      const granted = await navigator.storage.persist();
      setPersistence(granted ? "granted" : "denied");
    } catch {
      setPersistence("unavailable");
    }
  };

  const persistenceLabel =
    persistence === "requesting" ? COPY.privacy.storageRequesting :
    persistence === "granted" ? COPY.privacy.storageGranted :
    persistence === "denied" ? COPY.privacy.storageDenied :
    persistence === "unavailable" ? COPY.privacy.storageUnavailable :
    COPY.privacy.storageAction;

  return (
    <>
      <PageHeader eyebrow={COPY.privacy.eyebrow} title={COPY.privacy.title} intro={COPY.privacy.intro} />
      <div className="privacy-grid">
        <section className="privacy-card">
          <span className="privacy-card__icon"><Icon name="shield" /></span>
          <div><h2>{COPY.privacy.storageTitle}</h2><p>{COPY.privacy.storageBody}</p><button className="button button--soft" type="button" onClick={requestPersistence} disabled={persistence !== "idle"}>{persistenceLabel}</button></div>
        </section>
        <section className="privacy-card">
          <span className="privacy-card__icon"><Icon name="download" /></span>
          <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.privacy.backupTitle}</h2><p>{COPY.privacy.backupBody}</p><div className="button-cluster"><button type="button" disabled>{COPY.privacy.exportJson}</button><button type="button" disabled>{COPY.privacy.exportCsv}</button><button type="button" disabled>{COPY.privacy.exportMetrics}</button></div></div>
        </section>
        <section className="privacy-card">
          <span className="privacy-card__icon"><Icon name="arrow" /></span>
          <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.privacy.importTitle}</h2><p>{COPY.privacy.importBody}</p><label className="file-button file-button--disabled" aria-disabled="true"><input type="file" accept=".json" disabled />{COPY.privacy.chooseFile}</label></div>
        </section>
        <section className="privacy-card"><span className="privacy-card__icon"><Icon name="handoff" /></span><div><h2>{COPY.privacy.sharingTitle}</h2><p>{COPY.privacy.sharingBody}</p></div></section>
      </div>
      <section className="danger-zone">
        <span><Icon name="trash" /></span>
        <div><Badge tone="planned">{COPY.global.planned}</Badge><h2>{COPY.privacy.deleteTitle}</h2><p>{COPY.privacy.deleteBody}</p><button className="button button--danger-ghost" type="button" disabled>{COPY.privacy.deleteAction}</button></div>
      </section>
      <p className="provenance"><Icon name="info" />{COPY.privacy.provenance}</p>
    </>
  );
}

function Toggle({ checked, onChange, label, body }: { checked: boolean; onChange: () => void; label: string; body: string }) {
  return (
    <button className="toggle-row" type="button" role="switch" aria-checked={checked} onClick={onChange}>
      <span><strong>{label}</strong><small>{body}</small></span><i className={checked ? "toggle toggle--on" : "toggle"}><b /></i>
    </button>
  );
}

function Settings({
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

function Status() {
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

function PassViewer() {
  const passState = useSyncExternalStore(subscribeHash, readPassState, readDemoPassState);

  if (passState !== "demo") {
    const expired = passState === "expired";
    return (
      <div className="pass-page">
        <header><Brand /></header>
        <main>
          <section className="pass-state">
            <span><Icon name={expired ? "clock" : "info"} /></span>
            <p className="eyebrow">{COPY.pass.eyebrow}</p>
            <h1>{expired ? COPY.pass.expiredStateTitle : COPY.pass.invalidTitle}</h1>
            <p>{expired ? COPY.pass.expiredStateBody : COPY.pass.invalidBody}</p>
          </section>
        </main>
        <footer>{COPY.global.codenameDisclaimer}</footer>
      </div>
    );
  }

  return (
    <div className="pass-page">
      <header><Brand /><Badge tone="demo">{COPY.pass.source}</Badge></header>
      <main>
        <div className="pass-heading"><p className="eyebrow">{COPY.pass.eyebrow}</p><h1>{COPY.pass.title}</h1><p>{COPY.pass.generated}</p></div>
        <section className="pass-source"><Icon name="info" /><div><h2>{COPY.pass.source}</h2><p>{COPY.pass.sourceBody}</p></div></section>
        <section className="pass-brief"><strong>{COPY.pass.summary}</strong><div><h2>{COPY.pass.open}</h2><p>{COPY.pass.none}</p></div><div><h2>{COPY.pass.recents}</h2><ul>{COPY.handoff.recentItems.map((item) => <li key={item}>{item}</li>)}</ul></div></section>
        <section className="pass-expiry"><Icon name="clock" /><div><h2>{COPY.pass.expiredTitle}</h2><p>{COPY.pass.expiredBody}</p></div></section>
        <p className="provenance"><Icon name="shield" />{COPY.pass.provenance}</p>
      </main>
      <footer>{COPY.global.codenameDisclaimer}</footer>
    </div>
  );
}

export function ExperienceApp({ page }: { page: ExperiencePage }) {
  const nursery = useSyncExternalStore(subscribePreferences, readNurseryPreference, readFalse);
  const reduced = useSyncExternalStore(subscribePreferences, readMotionPreference, readFalse);

  const preferenceClass = ["preference-frame", nursery ? "theme-nursery" : "", reduced ? "reduce-motion" : ""].filter(Boolean).join(" ");

  if (page === "home") return <div className={preferenceClass}><Home /></div>;
  if (page === "onboarding") return <div className={preferenceClass}><Onboarding /></div>;
  if (page === "pass") return <div className={preferenceClass}><PassViewer /></div>;

  const demo = page === "demo";
  const frameClass = ["app-frame", nursery ? "theme-nursery" : "", reduced ? "reduce-motion" : ""].filter(Boolean).join(" ");

  return (
    <div className={frameClass}>
      <a className="skip-link" href="#main">{COPY.global.skipToContent}</a>
      <AppNavigation page={page} demo={demo} />
      <main className="app-main" id="main">
        {page === "today" && <Today />}
        {page === "demo" && <Today demo />}
        {page === "capture" && <Capture />}
        {page === "timeline" && <Timeline />}
        {page === "insights" && <Insights />}
        {page === "handoff" && <Handoff />}
        {page === "privacy" && <Privacy />}
        {page === "settings" && (
          <Settings
            nursery={nursery}
            setNursery={(value) => writePreference(NURSERY_KEY, value)}
            reduced={reduced}
            setReduced={(value) => writePreference(MOTION_KEY, value)}
          />
        )}
        {page === "status" && <Status />}
      </main>
    </div>
  );
}
