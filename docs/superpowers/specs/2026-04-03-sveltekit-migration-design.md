# SvelteKit Migration — Design Spec

**Date:** 2026-04-03
**Status:** Implemented

## Overview

Migrate the frontend from a vanilla Vite + Svelte 5 SPA to SvelteKit, and replace the Express backend with SvelteKit's built-in server routes and adapter-node. This gives us client-side routing (sidebar links without page reloads), file-based route structure, and a single framework for both client and server.

## Motivation

Sidebar navigation links (`<a href="/arbitrage">`) currently cause full page reloads because there's no client-side router. SvelteKit's router intercepts `<a>` tags automatically for client-side navigation. Additionally, consolidating onto one framework eliminates Express as a dependency and simplifies the build/deploy pipeline from two build steps to one.

## Approach

**SvelteKit SPA mode (`ssr: false`) + `adapter-node`**

SSR is disabled globally. SvelteKit provides client-side routing, file-based route structure, and layout composition, but the app stays a client-rendered SPA. All data fetching remains client-side via `fetch('/api/...')`. The adapter-node output is a standalone Node/Bun server.

### Why SPA mode over SSR

- The app is a desktop game tool (FFXIV players on a second monitor), not an SEO-sensitive public site
- Data is dynamic and polling-based (2s cold start / 30s refresh) — SSR would add complexity coordinating server load → client polling handoff with no user-facing benefit
- SPA mode matches current behavior exactly, minimizing migration risk

### Why not adapter-bun

adapter-node is the most battle-tested adapter and works fine on Bun. The community `svelte-adapter-bun` is less mature and adds unnecessary risk for no practical benefit.

---

## Project Structure

```
src/
  lib/
    components/             # from src/client/components/ (minus AppShell)
      TopBar.svelte
      Sidebar.svelte
      StatusBar.svelte
      ThresholdControls.svelte
      OpportunityTable.svelte
    client/                 # from src/client/lib/
      api.ts
      navigation.ts
      sidebar.ts
      tooltip.ts
      xivapi.ts
    server/                 # from src/server/
      cache.ts
      scanner.ts
      scoring.ts
      universalis.ts
      thresholds.ts         # parseThresholds extracted from deleted api.ts
    shared/
      types.ts              # from src/shared/
  routes/
    +layout.svelte          # AppShell (top bar, sidebar, footer)
    +layout.ts              # export const ssr = false
    +page.server.ts         # redirect / → /arbitrage
    arbitrage/
      +page.svelte          # current App.svelte content
    api/
      opportunities/
        +server.ts          # GET handler
  hooks.server.ts           # init() starts scanner
  app.css                   # from src/client/app.css
  app.html                  # replaces index.html
svelte.config.js            # adapter-node config
vite.config.ts              # simplified for SvelteKit
tests/                      # stays in place, imports updated
```

### Files Deleted

- `src/client/main.ts` — SvelteKit handles app mounting
- `src/client/env.d.ts` — SvelteKit provides its own type declarations
- `src/server/index.ts` — Express server, fully replaced
- `src/server/api.ts` — Express router, replaced by +server.ts routes; `parseThresholds` extracted to `$lib/server/thresholds.ts`
- `index.html` — replaced by `src/app.html`

### Dependencies

**Added:** `@sveltejs/kit`, `@sveltejs/adapter-node`, `vitest`

**Removed:** `express`, `@types/express`, `compression`, `@types/compression`

---

## Server Architecture

### Scanner Startup

SvelteKit's `hooks.server.ts` provides an `init()` function that runs once on server startup. The scanner starts here as fire-and-forget:

```ts
// src/hooks.server.ts
import { startScanner } from '$lib/server/scanner'

export async function init() {
  startScanner().catch(err => {
    console.error('[server] Scanner crashed:', err)
    process.exit(1)
  })
}
```

Same pattern as the current Express server — the scanner runs its infinite loop in the background while SvelteKit handles HTTP requests.

### Rate Limiting

The CLI flag (`--rate-limit`) and admin endpoint (`PUT /api/admin/rate-limit`) are dropped. Rate limit becomes an environment variable read once on startup:

```ts
const configuredRate = Number(process.env['RATE_LIMIT']) || 5
export const rateLimiter = new OutboundRateLimiter(configuredRate)
```

To change rate limit, redeploy with a new env var. The admin endpoint is unnecessary given the plan to eventually extract the scanner into its own process.

### API Route

`GET /api/opportunities` becomes `src/routes/api/opportunities/+server.ts`. The handler uses SvelteKit's `RequestEvent` and returns `Response` objects:

- `parseThresholds` extracts from URL search params (same logic, different input shape)
- ETag/304, cold-start 202, and error responses translate directly
- The scoring pipeline (`scoreOpportunities`, cache reads) is unchanged

### Compression

Handled by Caddy (the existing reverse proxy) in production. The `compression` npm package is removed. SvelteKit's adapter-node docs recommend handling compression at the proxy layer. Caddy continues to handle TLS termination, domain routing, and compression.

---

## Frontend Routing & Navigation

### SPA Mode

Root `src/routes/+layout.ts` exports `ssr = false`. SvelteKit renders an empty HTML shell on the server; the client renders everything. All data fetching remains client-side via `fetch('/api/...')`.

### Root Redirect

`src/routes/+page.server.ts` redirects `/` to `/arbitrage`:

```ts
import { redirect } from '@sveltejs/kit'
export function load() {
  redirect(307, '/arbitrage')
}
```

Server-side load functions execute even with `ssr = false`.

### Client-Side Navigation

SvelteKit automatically intercepts `<a>` tags for client-side navigation. The existing `<a href="/arbitrage">` links in `Sidebar.svelte` work without modification — they will navigate without page reloads after the migration.

### Active State

Currently hardcoded (`const active = true`). Derived from the current URL using `$app/state`:

```ts
import { page } from '$app/state'
// ...
const isActive = (id: string) => page.url.pathname.startsWith(`/${id}`)
```

### TopBar Tool Name

Currently passed as `toolName="Arbitrage"` prop from AppShell. With routing, the layout derives it from the URL and navigation items:

```ts
import { page } from '$app/state'
import { navItems } from '$lib/client/navigation'

const currentTool = $derived(
  navItems.find(item => page.url.pathname.startsWith(`/${item.id}`))?.label ?? ''
)
```

### Layout (`+layout.svelte`)

The current `AppShell.svelte` becomes `+layout.svelte`. It renders:
- `TopBar` (tool name derived from URL)
- `Sidebar` (expand/collapse with localStorage persistence — unchanged)
- Ad zone container (empty div — unchanged)
- `{@render children()}` (replaces direct `<App />` render)
- Footer

Sidebar state management, toggle logic, and localStorage persistence are identical.

---

## Test Migration

### Runner: bun:test → vitest

vitest is SvelteKit's standard test runner. It resolves `$lib` aliases via the shared Vite config.

### Changes

| Aspect | Before | After |
|---|---|---|
| Import | `from 'bun:test'` | `from 'vitest'` |
| Module paths | `../../src/server/` | `$lib/server/` |
| Module mock | `mock.module()` | `vi.mock()` |
| Function mock | `mock()` | `vi.fn()` |
| Script | `"test": "bun test"` | `"test": "vitest run"` |
| CI | `bun test` | `bun run test` |

### What Doesn't Change

- All 83 test cases and their assertions — 1:1 preservation
- Test file locations: `tests/server/` and `tests/client/`
- Test structure: `describe`/`test`/`expect` API
- No tests are deleted or weakened

### Vitest Config

Uses `vite.config.ts` (SvelteKit's Vite config), which provides `$lib` alias resolution. A `test` block is added:

```ts
test: {
  include: ['tests/**/*.test.ts'],
}
```

---

## Build & Deployment

### Scripts

| Script | Before | After |
|---|---|---|
| `dev` | `dev:client` + `dev:server` (two terminals) | `vite dev` (one command) |
| `build` | `vite build` (client only) | `vite build` (SvelteKit, client + server) |
| `start` | `bun src/server/index.ts` | `bun build/index.js` |
| `test` | `bun test` | `vitest run` |

### Dockerfile

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["bun", "build/index.js"]
```

Simpler than before: one build step, no need to copy `src/` into the production image.

### CI (`.github/workflows/ci.yml`)

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: oven-sh/setup-bun@v2
  - run: bun install --frozen-lockfile
  - run: bun run test
  - run: bun run build
```

### Deploy (`.github/workflows/deploy.yml`)

Same structure, same commands for the CI job. Docker build/push unchanged.

---

## Behavior Parity Verification

The migration must be verified by:

1. **All 83 existing tests pass** under vitest with updated imports
2. **Manual side-by-side verification:**
   - Layout structure (top bar, sidebar, content area, footer)
   - Sidebar expand/collapse + localStorage persistence
   - Data polling (cold start progress bar + 30s refresh)
   - Threshold controls with debounced fetch
   - Flash animation on scan update
   - Footer links open in new tabs
   - Sidebar navigation does NOT cause a page reload (the whole point)

---

## Out of Scope

- SSR / server-side data loading
- Cache persistence (separate follow-up)
- Additional routes beyond `/arbitrage`
- Login/auth implementation
- Google AdSense integration
- Mobile layout
- Scanner extraction to separate process
