# Experience runtime integration

`createBrowserExperienceRuntime({ mode })` is the production composition root. Create it once in a client provider, call `initialize()` in an effect, subscribe with `runtime.subscribe`, and read the presentation contract with `runtime.getSnapshot()`. Pass the matching property (`today`, `capture`, `timeline`, and so on) to each feature page. Call `dispose()` when the provider is permanently unmounted; disposal closes and unregisters the event repository and metrics connection.

For hooks, `useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)` is the intended bridge. The runtime is hook-independent and never imports React. Browser construction fails explicitly outside a client environment or without localStorage/IndexedDB. Production storage is locked to the registered `default` namespace so exact deletion cannot miss dynamically named databases.

Tests and non-browser shells can call `createExperienceRuntime(dependencies)` with in-memory or fake ports. `startTimer()` exposes the explicit `started | overlap | error` result. `handoffTransportsFor(payload, origin)` preflights the complete URL against both transport ceilings. `getLastImportResult()` exposes `{ imported, skipped }`; because the frozen privacy view has no mixed-result state, a partial import is rendered as an error with both counts instead of a misleading success.

The JSON backup includes the validated realm-scoped profile and all events, including soft-deleted records. Import is fully validated before writes. Capture preflights every generated ID—including batch uniqueness—before its single repository import. If an external race still changes the batch while saving, the capture error reports the exact imported/skipped result and tells the user to review the timeline.

The privacy controller requires exact `DELETE`. Browser composition obtains it through a prompt, records the content-free deletion metric before deletion, closes registered connections, removes both profile realms, deletes app databases and caches, and records nothing afterward. Runtime entry points such as handoff opening reject after deletion, so they cannot recreate the metrics database.

Speech uses Web Speech recognition only. Browser-service recognition enters disclosure before permission. `local-confirmed` is emitted only after the browser reports on-device availability and exposes `processLocally`. Mid-session recognition errors are delivered to the runtime and leave listening in a safe error state. No recorder or audio blobs are created.

Quick logs never invent required care details. Solids and tummy-time request their required description or duration; canceling or invalid input performs no write. Timeline revisions preserve the original `enteredWallClock` audit value even when the corrected instant changes.

Runtime settings are the single source of truth for nursery and reduced-motion preferences. Providers should render `snapshot.settings.preferences` and invoke `onPreferenceChange`; they should not also read or write the legacy standalone `nuzzlecue-*` preference keys. Both onboarding and settings receive the same supported time-zone list with the active zone guaranteed present.
