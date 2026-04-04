# ADR-010: SvelteKit Migration — Replace Express with SvelteKit

**Status:** Accepted
**Date:** 2026-04-04
**Supersedes:** [ADR-001](./ADR-001-backend-architecture.md)

## Context

The app used a Vite + Svelte 5 SPA with a separate Express backend (ADR-001). Sidebar navigation links caused full page reloads because there was no client-side router. Additionally, the dual-build setup (Vite for client, Express for server) meant two dev servers, two build steps, and Express as an extra dependency.

## Decision

**Migrate to SvelteKit SPA mode (`ssr: false`) with `adapter-node`.**

SvelteKit takes over both client and server. Source files live under `src/lib/` (for the `$lib` alias), routes in `src/routes/`, and `hooks.server.ts` starts the background scanner. Express, the manual entry point, and `compression` middleware are all removed — SvelteKit + Caddy handle everything.

SSR is disabled globally. The app remains a client-rendered SPA. SvelteKit provides client-side routing, file-based route structure, and layout composition.

## Rationale

- Client-side routing eliminates page reloads on sidebar navigation (the primary motivation)
- Single framework for both client and server eliminates Express as a dependency
- One dev command (`vite dev`) instead of two separate servers
- One build step produces a standalone server (`build/index.js`)
- `adapter-node` is battle-tested and works on Bun without issues
- SPA mode matches existing behavior exactly, minimizing migration risk
- The scanner's fire-and-forget pattern maps directly to SvelteKit's `hooks.server.ts` `init()` function

## Alternatives Considered

- **SSR mode:** Rejected — the app is a desktop game tool, not SEO-sensitive. Data is dynamic and polling-based. SSR would add complexity for no user-facing benefit.
- **`adapter-bun`:** Rejected — community adapter is less mature than `adapter-node`, which works fine on Bun.
- **Keep Express, add a client-side router:** Rejected — adds another dependency rather than consolidating. SvelteKit is the natural evolution for a Svelte app.

## Consequences

- Express, `@types/express`, `compression`, `@types/compression` removed as dependencies
- `@sveltejs/kit`, `@sveltejs/adapter-node` added (devDependencies)
- Tests migrated from `bun:test` to `vitest` (SvelteKit's standard test runner, resolves `$lib` aliases)
- Compression handled by Caddy (reverse proxy) instead of Node.js middleware
- Rate limit configuration moved from CLI flag / admin endpoint to environment variable (`RATE_LIMIT`)
- All 83 existing tests preserved and passing under vitest

See full design spec: `docs/superpowers/specs/2026-04-03-sveltekit-migration-design.md`
