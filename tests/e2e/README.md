# Wired journey tests

The journey suite targets the live controller-backed views. It stays visible as skipped coverage in the normal E2E command until those controllers are integrated.

Run it after live wiring with exactly:

```sh
RUN_WIRED_JOURNEYS=1 npm run test:journeys
```
