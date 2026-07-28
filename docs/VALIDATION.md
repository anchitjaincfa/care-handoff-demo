# Validation and kill gates

## Measurement privacy

Launch has no telemetry endpoint. A separate local metrics ledger records only counters and timings, never names, transcripts, event content, or pass payloads. Participants inspect and explicitly export ledger JSON after two weeks.

## North star

Care-days with a confirmed handoff briefing per active household.

## Local metrics

Onboarding completion; first confirmed event time; proposed, accepted-without-edit, accepted-after-edit, and refused parser counts; typed/voice/manual channel; time to confirmed entry; briefing generated; QR displayed; pass opened; distinct care days; export/delete/privacy-center actions.

No content-bearing properties are recorded.

## Cohort

Recruit 15 newborn-care specialists, night nurses, or doulas and their consenting client families. Run 14 days. Collect metrics exports and interviews. Recruitment begins during implementation.

## Pre-registered signals

- Parse acceptance without edits below 80%: restrict parser scope or reconsider the deterministic approach.
- Parser refusal above 15%: make structured entry primary and narrow parser language.
- Briefing on fewer than 25% of multi-caregiver care-days: strong handoff warning, paired with interviews.
- Fewer than 8 of 15 recruits active on at least 7 distinct days in 14: beachhead or utility is weak.
- Fewer than 5 of 15 finish the study: recruitment/retention fails.
- Fewer than 10% of engaged participants choose any paid research option or state non-zero willingness to pay: monetization is unproven.

These are small-sample signals, not statistically precise market estimates. The lower retention floor reflects the deliberate choice to avoid system-generated reminders and engagement pressure.

## Research probes

1. Professional willingness-to-pay interview with randomized hypothetical ranges; no payment collection.
2. Open-ended family willingness to pay after meaningful use.
3. Clearly labeled research preview for managing multiple client families.

No price appears in launch marketing.

## Interview topics

Previous handoff method; useful/missing briefing facts; trust effect of review-before-save; refused/misread phrases; when speech was inappropriate; response to QR/link warning; expectations for optional encrypted sync and recovery; reasons to stop; likely buyer.

## Decision

Produce a written go/pivot/kill memo. Strong professional-roster demand triggers a deliberate architecture fork: preserve local-only family mode while separately evaluating opt-in E2EE collaboration. It does not silently add ordinary server sync to this codebase.
