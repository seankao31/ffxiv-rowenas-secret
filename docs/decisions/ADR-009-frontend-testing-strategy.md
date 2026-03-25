# ADR-009: Frontend Testing Strategy

**Status:** Accepted
**Date:** 2026-03-25

## Context

The project has server-side tests (`bun test` for scoring, rate-limiter, universalis modules) but zero frontend test coverage. A debounce bug (Svelte 5 `$effect` auto-tracking `thresholds` via `loadData`, bypassing the 500ms debounce) went undetected — the kind of logic bug that a component-level test would catch.

## Alternatives Considered

### A) vitest + jsdom + @testing-library/svelte *(chosen for Phase 1)*
Mount Svelte components in a simulated DOM, trigger events, assert on DOM output and mock calls.

**Covers:** debounce/polling logic, flash trigger conditions, threshold input behavior, component rendering, reactive state changes.

**Does not cover:** real browser HTTP caching (ETag/304), CSS animation rendering, continuous slider drag behavior, cross-browser layout.

### B) Playwright (browser E2E)
Runs a real browser against the full app (server + client).

**Covers everything in (A) plus:** real HTTP cache behavior (ETag/304 actually returning cached responses via `fetch`), CSS animations visually rendering, real slider drag producing continuous `oninput` events, full server integration (cold start → scan → data display → filters → stale warnings).

**Tradeoffs:** Slower, requires running the server, more infrastructure to maintain.

### C) Both

Use vitest for fast component-level tests (CI on every commit), Playwright for slower integration tests (CI nightly or pre-deploy).

## Decision

**Phase 1: vitest + jsdom + @testing-library/svelte.** This catches the class of bugs we've encountered (reactive logic, debounce, conditional rendering) with minimal setup since vitest shares the existing Vite config.

**Phase 2 (when justified): Add Playwright.** Specific triggers for adding Playwright:
- ETag/304 caching needs verification (browser cache behavior can't be tested in jsdom)
- CSS animation bugs are reported (flash not rendering, timing issues)
- Slider interaction bugs that only reproduce with real mouse events
- Multi-page flows or routing are added
- Cross-browser or mobile layout issues arise
- Need to verify the full cold start → scan → display → filter pipeline end-to-end

## Consequences

- vitest + jsdom + @testing-library/svelte added as devDependencies
- Component tests go in `tests/client/` alongside existing `tests/server/`
- `bun test` continues to run server tests; `bunx vitest` runs client tests (separate runner since Bun's test runner doesn't support jsdom/Svelte compilation)
