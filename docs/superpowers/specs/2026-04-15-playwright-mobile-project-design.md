# Playwright Mobile Project Design

**Linear:** ENG-89
**Date:** 2026-04-15

## Problem

Mobile e2e coverage relies on per-test `test.use({ viewport })` overrides in `mobile-layout.test.ts`. This doesn't scale — new pages ship without mobile coverage unless authors manually add viewport overrides.

## Solution

Add a dedicated Playwright `mobile` project so all tests run at both desktop and mobile viewports automatically. Redistribute the existing `mobile-layout.test.ts` tests by feature.

## Config: `playwright.config.ts`

Two projects:

- **`desktop`** — `devices['Desktop Chrome']`, ignores `*.mobile.test.ts`
- **`mobile`** — `devices['iPhone 14']` (390×844), ignores `*.desktop.test.ts` and `craft-api.test.ts`

`craft-api.test.ts` is excluded from mobile because it uses the `request` fixture (pure API, no browser page).

## Test Redistribution

Delete `mobile-layout.test.ts`. Redistribute its tests by feature:

| New file | Tests | Description |
|---|---|---|
| `nav-drawer.mobile.test.ts` | sidebar hidden, hamburger visible, drawer open/close/escape | App shell responsive nav behavior |
| `opportunity-table.mobile.test.ts` | sticky column, horizontal scroll, controls stacking | Arbitrage table narrow-viewport behavior |

Drop the "desktop layout unchanged" tests (sidebar visible, hamburger hidden) — redundant inverses of the mobile tests.

### Shared mock helper

Both new mobile files and existing tests share similar `mockApi()` patterns. Extract a shared helper to `tests/e2e/fixtures/mock-api.ts` to avoid duplication.

## What runs where

| Test file | Desktop | Mobile |
|---|---|---|
| `opportunity-table.test.ts` | ✓ | ✓ |
| `crafting-breakdown.test.ts` | ✓ | ✓ |
| `cold-start.test.ts` | ✓ | ✓ |
| `buy-route.test.ts` | ✓ | ✓ |
| `item-detail.test.ts` | ✓ | ✓ |
| `craft-api.test.ts` | ✓ | ✗ (pure API) |
| `nav-drawer.mobile.test.ts` | ✗ | ✓ |
| `opportunity-table.mobile.test.ts` | ✗ | ✓ |

## Viewport-sensitive tests in other files

`buy-route.test.ts` and `item-detail.test.ts` contain bounding-box assertions (FAB positioning, footer overlap). These run at both viewports — if they fail at mobile, that's a real layout bug to fix, not a test issue.
