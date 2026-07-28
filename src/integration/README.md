# Experience runtime integration

`createBrowserExperienceRuntime({ mode })` is the production composition root. Create it once in a client provider, call `initialize()` in an effect, subscribe with `runtime.subscribe`, and read the immutable presentation contract with `runtime.getSnapshot()`. Pass the matching property (`today`, `capture`, `timeline`, and so on) to each feature page. Call `dispose()` when the provider is permanently unmounted.

For hooks, `useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)` is the intended bridge. The runtime is hook-independent and never imports React.

Tests and non-browser shells can call `createExperienceRuntime(dependencies)` with in-memory or fake ports. The same controller contract is returned in both cases. `startTimer()` exposes the explicit `started | overlap | error` result for shells that want a dedicated overlap message; the frozen page controller maps that outcome to its action phase.

The JSON backup envelope includes the validated realm-scoped profile and every event, including soft-deleted records. Import is fully validated before repository or profile writes. The privacy controller requires the exact text `DELETE`; browser composition obtains it through a prompt, records the content-free deletion metric before deletion, closes registered database connections, removes both profile realms, deletes app databases and caches, and deliberately records nothing after deletion.

Speech uses Web Speech recognition only. Browser-service recognition always enters the disclosure state before requesting permission. `local-confirmed` is emitted only when the browser's on-device availability probe returns `available` and the recognition object exposes `processLocally`. No recorder or audio blobs are created.
