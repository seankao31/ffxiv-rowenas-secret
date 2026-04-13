# ADR-014: Fixture Data Dev Mode

## Context

Running the full Universalis scanner during development is slow (minutes of API polling before the UI has data) and requires network access. Developers need a way to start the app with realistic data immediately.

## Decision

A `FIXTURE_DATA=true` environment variable bypasses the scanner and seeds the in-memory cache from a committed JSON snapshot (`src/lib/server/fixtures/snapshot.json`). The hooks entry point (`src/hooks.server.ts`) calls `seedFixtureData()` instead of `startScanner()` when this variable is set.

## Reasoning

**JSON instead of msgpack for the snapshot:**

- The snapshot is dev-only — human readability for debugging outweighs binary compactness.
- `JSON.parse()` is faster than msgpack decode for this use case (single parse, no streaming needed).
- Game data files (`tw-items.msgpack`, `recipes.msgpack`) remain msgpack because they're production artifacts where binary size matters.

**Explicit call from hooks, not auto-run on import:**

- `seedFixtureData()` has side effects (writes to the shared cache singleton, sets scan metadata). Auto-running on import would make the module impure and harder to test.
- The hooks file is the orchestration point — it already decides between scanner and fixture paths.

**Scan metadata is faked to "complete":**

- `setScanMeta()` is called with a completed timestamp so the UI sees a ready cache immediately. Without this, components that check `isCacheReady()` would show loading/scanning states indefinitely.

**Snapshot scope is TW-named items only:**

- Matches the scanner's item universe. The snapshot generator (`scripts/generate-snapshot.ts`) samples from items the scanner would actually fetch.

## Consequences

- The snapshot must be regenerated when the cache data shape changes (new fields on `ItemData`, changes to `Opportunity` structure).
- Fixture data is a frozen point-in-time sample — it won't reflect new items, recipe changes, or market dynamics.
- The `FIXTURE_DATA` check is a simple boolean gate with no intermediate modes. If partial scanning or selective fixture loading is needed later, this pattern would need extension.
