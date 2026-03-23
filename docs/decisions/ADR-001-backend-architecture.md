# ADR-001: Backend Architecture — All-in-One Express Monolith

**Status:** Accepted
**Date:** 2026-03-23

## Context

The scanner needs to continuously poll the Universalis API across ~20,000 items (infrastructure sizing baseline — see ADR-005), cache results, and serve them to a Svelte frontend. Three architectural patterns were considered.

## Alternatives Considered

### A) All-in-one Express monolith *(chosen)*
Single Node.js/TypeScript process runs the scan loop, caches results in memory, serves the REST API, and serves the Svelte frontend as static files.

### B) Two processes managed by PM2
A dedicated `scanner.ts` process writes results to disk (JSON file). A separate `server.ts` reads from that file and serves the API + frontend. PM2 manages both on EC2.

### C) Single process with a Worker Thread
Main thread handles HTTP and in-memory cache; a Worker Thread runs the scan loop and posts results back via `postMessage`.

## Decision

**Option A — the monolith.**

## Rationale

- The scan loop is entirely I/O-bound (just `await fetch(...)` calls to Universalis). It never blocks the Node.js event loop, so the "shared event loop" concern that would justify B or C does not apply here.
- This is a personal single-user tool. The added resilience of B (independent restart of scanner vs. API) is not worth the operational complexity.
- On a cold start (e.g., after a server restart), the first scan completes in ~5 minutes with the per-world strategy — an acceptable delay for a personal tool (per ADR-005 scan timing calculation).
- Option A can graduate to B later if a real reason emerges.

## Consequences

- In-memory cache is lost on process restart. First results appear ~5 min after startup (per ADR-005 scan timing calculation).
- Simpler deployment: one process, one `bun start`.
