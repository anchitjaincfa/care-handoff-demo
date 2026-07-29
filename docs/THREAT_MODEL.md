# Threat model and safety boundary

This is a product engineering threat model, not legal advice.

## Assets

Child profile, care events, caregiver identity, transcripts, exports, handoff payloads, local metrics, database backups, and product trust.

## Trust boundary

Launch records and metrics stay in browser storage. Static assets come from the deployment origin. Browser-provided speech may send audio to the browser vendor when local processing is not confirmed; the UI discloses that before capture.

## Primary threats and controls

### Messaging transport copies

A copied pass sent through SMS, iMessage, WhatsApp, email, or chat exists in that provider’s history and backups. Confirmation states: “However you send this—text, email, chat—a copy lives in that app’s history.” QR displayed directly between devices is default.

### Bounded user-entered handoff label

Within event projections, the sole user-entered string allowed in a pass is the reviewed solids food label, bounded to 1–120 characters. Because even a food label can contain sensitive or identifying text, the exact label must appear in the pre-generation payload preview with an adjacent consent disclosure that it will be included in the copied link or QR pass. The experience follow-up owns this disclosure before release. The whitelist excludes notes, captions, URLs, attachments, and arbitrary metadata.

### Browser history, clipboard, screenshots, QR photos

Fragments are not sent in the HTTP request, but remain visible to extensions and code on the origin and may appear in history or copied artifacts. The viewer offers clearing guidance. Expiry copy says: “This link stops opening in the app after 12 hours. It does not stop anyone who saved the link or took a screenshot.”

### Third-party code and XSS

An injected same-origin script can read unlocked browser data. Controls: no third-party scripts, session replay, or ad SDK; restrictive CSP; Trusted Types where practical; dependency pinning; automated dependency and secret scanning; output escaping; no unsafe HTML.

### Speech disclosure failure

Capability detection, not browser sniffing, chooses local-confirmed, browser-service, or unavailable copy. Microphone starts only after a user gesture. The app retains no recording. Typed/manual alternatives are always visible.

### Local data eviction or device loss

Persistent storage is requested but not guaranteed. Storage status, quota, export/import, and explicit warnings remain live. Browser storage is never described as backup.

### Accidental or malicious deletion

Delete-all requires exact confirmation and previews affected databases and caches. Soft-delete with undo is ordinary event deletion. Export is offered before purge.

### Demo confusion

Demo and real databases have different names. Passes include source demo|real. Demo viewers show a persistent synthetic-data banner. Demo content never copies automatically into real records.

### Prediction harm

No diagnosis, health-state assessment, norm comparison, absence alert, or imperative. Routine ranges are gated by sample count and freshness. Below gate, numbers are suppressed.

### Unsafe export interpretation

Exports state: self-reported, unverified, generated locally, not a clinical record. They contain no diagnosis or treatment language.

## Handoff data minimization

Default pass includes nickname or initial, shift range, independent full-shift totals, at most 30 recent structured feed/sleep/diaper/pumping/solids/tummy-time events, and open timers. Within event projections, the sole bounded user-entered string is the reviewed solids food label (1–120 characters); its exact value and sharing disclosure must be consent-visible before generation. It excludes every other free-text note, photo, medication, growth field, attachment, URL, and arbitrary metadata. Exact payload preview appears before generation.

## Accepted limitations

- A recipient can retain, forward, decode, or screenshot a pass.
- Advisory expiry can be bypassed by a saved copy, decoding, or clock changes.
- Local data can be removed by the user, browser, OS, storage pressure, or device loss.
- Browser speech privacy varies by runtime and locale.
- Launch has no remote revocation or custody-dispute enforcement.
- A static app cannot provide real multi-user synchronization.

## Compliance floor before real beta

Adult account posture; consumer-health notice; consent records for optional processing; retention/deletion map; subprocessor inventory; incident and breach response; no sale, ads, or training by default; counsel review for state consumer-health laws, GDPR/UK special-category data, CPRA, and any provider relationship. HIPAA status is relationship-dependent and is not claimed.
