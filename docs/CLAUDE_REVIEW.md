# Four-round Claude plan review

Claude Code Opus served as an independent adversarial reviewer. This is a decision log, not a verbatim transcript.

## Round 1 — thesis and MVP

Objections: a PWA cannot promise wake-word/background hands-free logging; Web Speech is not uniformly device-local; browser storage is not backup; early predictions risk false precision; feeds/sleeps need interval and timezone-safe data; local-only and caregiver sync are different architectures; voice plus prediction is already competitive parity.

Accepted: one-sentence reviewed capture; typed parity; explicit confirm before every commit; capability-gated speech disclosure; IndexedDB status/export/import; household/baby-scoped interval model; descriptive predictions above data gates; no cloud/auth in launch; parser corpus, egress tests, deletion tests.

## Round 2 — architecture and scope

Conclusion: expansive UI is honest when most surfaces are real and local. Insights, handoff, privacy, and exports do not need to be mocks. Only invites, sync, and push are truly planned.

Accepted: static export as structural no-server boundary; emitted-asset service worker with prompt updates; Dexie behind ports; Zod validation on read; Temporal time; three-state speech adapter; capability registry enforced in CI; GitHub Actions build truth; domain/UI/infra ownership after contracts freeze.

## Round 3 — safety, differentiation, GTM

Conclusion: deterministic parsing is not a standalone consumer moat, but verified records matter in shift handoff. Validation beachhead becomes newborn-care specialists and shift-based families.

Accepted: device-local record built for handoff; “human attention” becomes “unfinished in the log”; printable appointment summary never clinician-ready; illness, adequacy, medication advice, diagnosis, and percentiles are Excluded; no published price; handoff care-days north star; householdId schema; QR-first local pass; calm constitution; no system-generated reminders.

## Round 4 — final audit

Verdict: conditional go. Conditions adopted:

1. Local-only metrics ledger exported explicitly by testers.
2. Positioning says device-local, not on-device.
3. Messaging-provider copies are the primary pass leak.
4. Contracts land serially before parallel agents.
5. No guessed competitor importer without sample exports.
6. Add two-week validation Phase 6.
7. Codename disclaimer on deployment.
8. Accessibility runs in both themes.
9. Light CI on pushes; heavy CI on PR/main/manual.
10. No-op service worker begins in foundation.
11. Self-host fonts, mark demo passes, enforce payload ceilings.

## Final status

**Conditional GO**, with every condition incorporated in the product plan, architecture, threat model, and validation plan before implementation.
