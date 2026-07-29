# Wired journey and PWA tests

The wired journey suite targets the live controller-backed views. Its desktop and mobile cases are a permanent part of the normal `npm run test:e2e` command and are never hidden behind an environment gate.

Use `npm run test:journeys` when you want to run only the wired journey spec.

PWA coverage combines unit tests for update monitoring and prompt state with a real-browser test that installs an isolated worker, observes a waiting update, sends the production `SKIP_WAITING` protocol, and verifies that Chromium changes controllers. The fixture files exist only for the duration of the test and are not part of the production export.
