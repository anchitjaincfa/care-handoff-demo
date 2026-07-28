# Product plan

## Source and objective

This project is grounded in the July 27, 2026 IdeaBrowser email “Baby tracker you talk to.” The source problem is real: feeds, naps, and diaper changes are hardest to log when a parent has the fewest free hands. The email proposed voice capture, device privacy, and next-event forecasting.

Market review found that “Lullalog” is already used by active baby trackers and Huckleberry already offers conversational voice/text logging. This project therefore uses **NuzzleCue** only as a working codename, with no trademark claim.

## Positioning

> NuzzleCue is a private, device-local care record built for handoff. Every spoken or typed entry is shown for review before it is saved—so the log the next caregiver reads is one a person actually confirmed.

The web product never claims wake-word, background, or lock-screen listening. Speech is capability-gated; typed natural language and manual quick logs always remain available.

## Beachhead and users

Primary validation cohort: newborn-care specialists, night nurses, doulas, and shift-based families. Secondary users include parents, co-parents, nannies, grandparents, parents of multiples, and accessibility users.

Core jobs:

1. Capture feed, sleep, and diaper events with one sentence or a few taps.
2. Review and correct every interpretation before it changes the record.
3. See what happened during a care shift and what is unfinished in the log.
4. Carry a self-reported summary to an appointment without presenting it as a clinical record.
5. Preserve local control over sensitive child and family data.

## Calm constitution

No streaks, badges, red alarm states, comparison to other babies, daily goals, system-generated nags, parental judgment, or gamification of infant care.

## Feature taxonomy

- **Live:** works on the user’s device and real local record.
- **Demo:** full behavior against an isolated synthetic database.
- **Preview:** interactive explanation or visualization over demo-only data.
- **Planned:** visible future capability with disabled controls and a reason.
- **Excluded:** intentionally not planned because it conflicts with safety or scope.

### Launch features

Live:

- Marketing, onboarding, baby profile, timezone, locale, units, and tracking preferences
- Typed natural-language capture
- Capability-gated push-to-talk with adjacent processing disclosure
- Multi-event feed/sleep/diaper parsing
- Review, field-level uncertainty, edit, correction, confirm, undo
- Nursing/bottle feeds, sleep intervals/timers, wet/dirty/both diapers
- Manual pumping, solids, and tummy-time quick logs
- Today dashboard, active timers, timeline, edit/delete, seven-day summaries
- Descriptive routine windows gated by data sufficiency and showing sample count
- Shift handoff briefing, local export, QR-first second-device pass
- Nursery theme, reduced motion, keyboard and screen-reader support
- JSON/CSV import and export, local metrics export, delete-all
- Privacy center, feature status, offline PWA, install help
- Demo family in a separate database

Planned:

- Accounts, end-to-end encrypted sync, multi-device live collaboration
- Caregiver invitations and role administration
- User-scheduled reminders, push, native widgets, Siri/App Intents, Android shortcuts
- Multiple live households and professional roster UI
- Importers for competitors after real sample files are obtained
- Native iOS/Android apps, watches, integrations, multilingual speech
- Read-only professional links with real revocation

Excluded:

- Diagnosis, triage, dosage guidance, emergency or safety monitoring
- Illness, dehydration, jaundice, adequacy, or developmental predictions
- Growth percentiles and norm comparisons
- Always-on/background listening, baby-monitor audio/video
- Advertising, data brokerage, hidden training, social feed

## Information architecture

Public: landing, privacy explanation, product status, handoff-pass viewer.

App: onboarding, Today, Capture/Review, Timeline, Insights, Handoff, Privacy, Settings, Demo.

Navigation is mobile bottom tabs and desktop side rail. A microphone action is prominent but never the only logging path.

## Key workflows

### Capture

Idle → permission disclosure → listening or typing → final transcript → deterministic parse → proposed event cards → field correction → explicit confirm → local commit → undo.

Ambiguous child or time blocks save. An omitted time is visibly labeled “assumed now.” A past-clock phrase resolves to the nearest past instant, never silently to the future.

### Timers

Start, resume after reload, stop, edit, and undo. Open intervals are first-class records. Overlap produces a review choice rather than silent replacement.

### Handoff

Choose a shift boundary → inspect included events → edit the factual briefing → generate locally → display QR by default or explicitly copy a link. The viewer is read-only and shows demo/real provenance. Pass expiry is advisory UI behavior, not revocation.

A launch handoff explicitly carries whitelisted projections for feed, sleep, diaper, pumping, solids, and tummy-time. Factual totals cover the entire selected shift independently of the capped recent-event list, so the pass remains truthful when more than 30 events fall inside the boundary.

### Routine insights

Use local medians/quantiles over sufficient complete history. Show ranges, sample count, freshness, and descriptive language only. Below the gate, show factual recent history and “patterns are still forming.” No imperative or health-state wording.

## Business hypothesis

Consumer logging is expected to remain free. No launch price is published. Validation probes professional willingness to pay, family open-ended willingness to pay, and demand for a multi-household professional roster. Strong roster demand creates an explicit future fork between local-only architecture and opt-in encrypted collaboration.

## Growth

1. Direct recruitment of 15 newborn-care professionals.
2. Agency and doula-network partnerships after individual validation.
3. Incumbent import only after obtaining real exports.
4. Privacy-safe single-job SEO tools such as printable feeding logs and handoff generators.
5. Optional family sharing loops that never expose child data without explicit choice.

## Phases and exit criteria

0. Docs and contracts: source, plan, ADRs, threat model, feature statuses, copy policy, metrics, roadmap are committed and Claude-reviewed.
1. Foundation, serial: scaffold, tokens, routes, frozen schemas/ports, split registry, copy module, no-op service worker, CI stubs. Main is green and claims scanner catches a seeded violation.
2. Parallel build: domain/data/parser; experience; test/infra/metrics. Interfaces remain frozen.
3. Integration: onboarding → capture → review → commit → timeline → briefing → second-device pass works.
4. PWA/privacy hardening: offline, service worker update prompt, CSP, egress canary, export/wipe/import, both-theme accessibility.
5. Review and deploy: Claude code/security/UX audit, fixes, Vercel production deploy, mobile/desktop QA.
6. Validation: recruit 15 professionals, run two weeks, collect explicitly exported local metrics, interviews, written go/pivot/kill decision.

## Launch acceptance

- No event is written without explicit confirmation.
- Same capture task works without a microphone.
- Hard reload and offline operation preserve local state.
- Export → wipe → import round-trips.
- Demo and real stores remain isolated.
- Prediction sample gates and copy rules are test-enforced.
- No event content or canary value leaves the origin.
- Delete-all clears IndexedDB and application caches.
- Every route has a capability status.
- Critical flows pass WCAG 2.2 AA checks in light and nursery themes.
- Production works on mobile and desktop and visibly discloses platform limits.

_NuzzleCue is a working codename, not a brand. No trademark claimed._
