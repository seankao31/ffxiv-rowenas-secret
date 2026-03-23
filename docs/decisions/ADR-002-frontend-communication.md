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

- The backend produces a complete updated ranked list only once per full scan cycle (~20s for ~100 API calls at 5 req/s). There are no meaningful partial updates between cycles to stream.
- Polling at the scan cycle interval is functionally equivalent to streaming: results are fresh as soon as they are available.
- Data payloads are small (a Top-N JSON list, likely <50KB). Even polling every 10 seconds, monthly transfer is well within the AWS EC2 100GB free egress tier.
- SSE and WebSocket add implementation complexity with no benefit here — data only flows server → client, and only updates once per scan cycle anyway.

## Consequences

- Maximum result lag equals the polling interval (configured to match scan cycle duration).
- Stateless — no persistent connections to manage.
