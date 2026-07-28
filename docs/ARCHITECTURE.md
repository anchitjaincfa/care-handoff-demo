# Architecture decisions

## Structural privacy boundary

The launch is a static-exported Next.js TypeScript PWA. Domain logic and family records execute in the browser. There are no route handlers, server actions, event APIs, auth, or cloud database in the launch build. Vercel serves only versioned static assets.

CSP restricts connections to same-origin assets. This does not control a browser’s own speech service, so speech processing is disclosed by capability state.

## Core stack

- Next.js App Router, TypeScript, React
- Static export with known routes and query-param detail views
- Token-based CSS and self-hosted fonts
- Zod schemas and runtime validation
- Dexie IndexedDB adapter behind repository ports
- In-memory adapter for tests and isolated demo bootstrapping
- Temporal polyfill and Intl for time handling
- Deterministic parser: normalize → segment → intent → slots → validate → proposed events
- Local descriptive insight and routine modules
- Service worker with generated asset manifest and prompt-driven updates
- Vitest, Testing Library, fake-indexeddb, Playwright, axe

## Domain model

Every event carries id, householdId, babyId, type, versioned fields, fixed-precision UTC startedAt/endedAt, IANA timeZone, immutable enteredWallClock, source, timestamps, deletedAt tombstone, schemaVersion, and optional revision pointer.

Feeds and sleeps are intervals with open state. Breastfeeding stores side and duration. Bottle feeds store volume, unit, and contents. Diapers store wet/dirty/both.

## Ports

EventRepository: list, get, append, strict appendBatch, revise, softDelete, restore, purgeAll, export, tolerant seed import, quarantine-aware isEmpty, atomic same-household restoreSnapshot, and empty-realm adoptSnapshot.

SpeechPort: capability, locality status, start, stop, cancel. Final transcript only reaches the parser.

ClockPort: injected current instant, timezone, deterministic test clock.

StoragePort: persistence request/status, quota estimate, database identifiers, clear caches.

MetricsLedger: local counters/timings only, explicit export, never transmitted.

## Persistence

Dexie types do not escape the adapter. Zod validates on read and quarantines corrupt records without crashing. Migrations use fixtures. Demo uses a different database name. Delete-all purges databases and Cache Storage after exact confirmation.

Persistent storage is requested and status shown. Export messaging explains that browsers and operating systems can still clear local data.

## Speech capability ladder

1. Probe runtime support for local SpeechRecognition and language packs.
2. If browser speech may be remote, show adjacent disclosure before use.
3. If unavailable or denied, preserve typed/manual paths.
4. Never instantiate MediaRecorder in launch.
5. No interim transcript can commit. Audio is never stored by the app.

## PWA

A no-op service worker registers in foundation. Hardening adds a generated precache from emitted static files. There is no automatic skipWaiting; the UI prompts for update. sw.js is served no-cache. Offline deep links use known static routes.

## Handoff pass codec

Minimal schema: version, source demo|real, generatedAt, expiresAt, nickname/initial, shift bounds, factual totals, recent structured events, open timers, checksum.

No free-text notes, photos, medication, growth, or attachments. Deflate-raw via CompressionStream when available, then base64url in the URL fragment. QR target is at most 1,200 compressed bytes; URL-only ceiling is 8KB. Generation refuses above the applicable limit.

Expiry is viewer courtesy, not cryptographic revocation. QR is default; link copy is secondary. No third-party QR or analytics service receives payload content.

## Capability registry

Registry is split into domain and surface files and re-exported from an infra-owned index. Every route and surface declares Live, Demo, Preview, Planned, or Excluded plus reason and data scope. Status page and README table are checked from the registry.

## CI

Every push: format/lint/typecheck/contracts, claims/copy scan, parser, unit.

Pull requests to main and manual dispatch: static build, service-worker build, e2e, offline, accessibility in both themes, privacy egress, delete-all, demo isolation, bundle report.

Concurrency cancels superseded runs. GitHub Actions is build truth because no project checkout exists locally.

## Parallel ownership after contract freeze

- Domain: src/domain and src/adapters; owns unit tests for domain work.
- Experience: app, src/features, src/components, src/copy; owns component tests.
- Infra: tests, workflows, service worker, scripts, dependencies, product config, registry index.

Dependency additions go through Infra. Shared contracts land serially before these branches open.

## Future collaboration fork

If validation proves professional multi-household demand, evaluate opt-in E2EE separately: household data keys, explicit device approval, recovery/revocation limitations, encrypted events, server sequence cursor, metadata disclosure. It is not partially implemented in launch.

## Export packaging

CSV export is a ZIP containing events.csv and PROVENANCE.txt and is export-only. JSON backup is the supported restore format. The notice states that the contents are self-reported, unverified, generated locally, and not a clinical record.
