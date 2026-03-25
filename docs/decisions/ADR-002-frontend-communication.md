# ADR-002: Frontend Communication — REST Polling

**Status:** Accepted
**Date:** 2026-03-23

## Context

The Svelte frontend needs to display a live-updating ranked list of arbitrage opportunities. Three communication patterns were considered.

## Alternatives Considered

### A) REST Polling *(chosen)*
Frontend calls `GET /api/opportunities` every ~30 seconds and replaces the displayed list.

### B) WebSocket
A persistent bidirectional connection. Server pushes updates as they arrive; client can also send messages to the server.

### C) Server-Sent Events (SSE)
A persistent one-way connection from server to client. Server pushes updates; client cannot send back through the same channel.

## Decision

**Option A — REST polling.**

## Rationale

- The backend produces a complete updated ranked list only once per full scan cycle (~2.5 min with the per-world strategy — see ADR-005 and ADR-006). There are no meaningful partial updates between cycles to stream.
- Polling at the scan cycle interval is functionally equivalent to streaming: results are fresh as soon as they are available.
- Data payloads are small (a Top-N JSON list, likely <50KB). Even polling every 10 seconds, monthly transfer is well within the AWS EC2 100GB free egress tier.
- SSE and WebSocket add implementation complexity with no benefit here — data only flows server → client, and only updates once per scan cycle anyway.

## Refinement: ETag Caching (2026-03-25)

The 30s poll sends the full response (~31 KB raw, ~4.5 KB gzipped) every time, even when scan data hasn't changed. With a tab open 24/7 this is ~2.6 GB/month raw.

**ETag strategy:** The server derives an ETag from `scanCompletedAt` + filter params (price_threshold, listing_staleness_hours, days_of_supply, limit, hq). This is a pure function — no per-client state. On `If-None-Match` match, the server returns 304 and skips `scoreOpportunities()` entirely, saving both bandwidth and CPU.

**Result:** ~99% of polls return 304 (~200 bytes). Monthly traffic drops to ~21 MB. gzip/Brotli compression (via `compression` middleware) further reduces the remaining full responses.

**Why not partial diffs (JSON Patch, WebSocket push):** The full opportunity list is small (~4.5 KB compressed) and changes atomically per scan cycle. Diffing adds per-client server state and complexity for marginal savings over ETag/304.

## Consequences

- Maximum result lag equals the polling interval (configured to match scan cycle duration).
- Stateless — no persistent connections to manage. ETag comparison is a pure function of scan timestamp + query params.
