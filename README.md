# Care Handoff Demo

Private repository for a device-local, voice-assisted baby-care record and shift-handoff PWA.

> NuzzleCue is a private, device-local care record built for handoff. Every spoken or typed entry is shown for review before it is saved—so the log the next caregiver reads is one a person actually confirmed.

## Project status

Planning completed after four adversarial Claude review rounds. The repository now ships a live, installable browser PWA with isolated real/demo records, review-before-save capture, device-local persistence, backup/restore, deletion, insights, and deliberate handoff passes. Typed and manual capture remain available everywhere; speech is offered only when the current browser reports support and after its processing boundary is disclosed. GitHub Actions is the build/test source of truth, and the project is not checked out in the local workspace.

## Read first

- [Product plan](docs/PRODUCT_PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [Claude decision log](docs/CLAUDE_REVIEW.md)
- [Validation and kill gates](docs/VALIDATION.md)

## Non-negotiable boundaries

- No event is saved without explicit review and confirmation.
- Typed/manual capture always works without microphone access.
- Launch records and metrics remain device-local.
- Browser speech processing is disclosed by detected capability.
- No diagnosis, advice, health-state prediction, norm comparison, ads, data sale, or hidden training.
- Handoff pass limitations are disclosed before sharing.

_NuzzleCue is a working codename, not a brand. No trademark claimed._
