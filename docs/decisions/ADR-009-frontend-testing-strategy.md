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

**Phase 2: Playwright E2E.** Added in ENG-50 to cover UI interactions that unit tests on pure functions can't reach (sort-by-column wiring, icon state changes, DOM reordering). Tests intercept API calls with `page.route()` for speed and determinism.

## Consequences

- vitest + jsdom + @testing-library/svelte added as devDependencies
- Component tests go in `tests/client/` alongside existing `tests/server/`
- Unit tests run under vitest via `bun run test`
- E2E tests run under Playwright via `bun run test:e2e` (Chromium only, dev server on dynamic port)
- E2E tests live in `tests/e2e/`, excluded from vitest via narrow includes
