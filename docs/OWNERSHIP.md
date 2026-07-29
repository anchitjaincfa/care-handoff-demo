# Contract freeze and ownership

Phase 1 contracts land on main before parallel work. Contract changes require a PR reviewed by all workstreams.

- Domain owns src/domain and src/adapters plus its unit tests.
- Experience owns app, src/features, src/components, and src/copy plus component tests.
- Infra owns tests harnesses, workflows, service worker, scripts, package.json, product.config.ts, and capability index.
- Domain appends only src/capabilities/domain.ts; Experience appends only src/capabilities/surfaces.ts.
- Dependency additions are requested from Infra; other workstreams do not edit package.json.

Frozen contracts: CareEvent and ProposedEvent schemas; EventRepository, ClockPort, SpeechPort, StoragePort, MetricsPort; five-state capability taxonomy; positioning and safety-copy skeleton; prediction sample gate 21; night boundary 19:00–07:00; handoff QR ceiling 1,200 bytes and advisory 12-hour expiry.

CSV export is delivered as an export-only ZIP containing events.csv plus PROVENANCE.txt; JSON backup is the supported restore format. Event snapshots are transaction-atomic within the repository, while profile settings are activated in separate browser storage with explicit recovery errors; cross-boundary adoption requires an empty, unconfigured realm and a non-empty event snapshot. The provenance notice states that data is self-reported, unverified, generated locally, and not a clinical record.
