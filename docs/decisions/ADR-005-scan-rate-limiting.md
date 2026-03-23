# ADR-005: Universalis API Rate Limiting & Scan Concurrency

**Status:** Accepted
**Date:** 2026-03-23

## Context

The scanner must fetch market data for all tradeable items across two phases (DC-level + home world). Item IDs are fetched dynamically at startup from `GET /api/v2/marketable` — the count must not be hardcoded, as new items are added with each FFXIV content patch.

**Infrastructure sizing baseline: 20,000 items** (above the ~16,000 currently tradeable as of early 2026, with buffer for future patches). This yields ~400 API calls per scan cycle (200 per phase, 100 items/batch).

Universalis imposes the following limits:

- **API rate limit:** 25 req/s (burst: 50 req/s)
- **Simultaneous connections per IP:** 8

## Decision

Use a **concurrent request pool capped at 8 connections**, rate-limited to **20 req/s** (leaving headroom below the 25 req/s hard limit to be a good API citizen and absorb latency variance).

## Rationale

### Why not sequential (1 request at a time)?

At 1 req/s with artificial 200ms delays (our initial estimate before knowing the actual limits), a full scan would take ~40 seconds. With the real 25 req/s limit and 8 concurrent connections available, we can do far better.

### Why cap at 20 req/s rather than 25?

- Leaves buffer for burst retries on 429 responses without immediately re-hitting the hard limit.
- Network latency means actual throughput is naturally below the theoretical maximum.
- Avoids being an aggressive API consumer on a crowdsourced public service.

### Scan cycle timing (at 20,000-item baseline)

```
Phase 1: ~200 calls ÷ 20 req/s  ≈ 10s
Phase 2: ~200 calls ÷ 20 req/s  ≈ 10s
Network overhead                 ≈  5s
Configurable cooldown (default) = 60s
─────────────────────────────────────
Total cycle interval:           ≈ 85s
```

Memory at baseline: 20,000 items × ~5KB ≈ **100MB** — comfortable on any EC2 instance.

## Implementation

A simple async semaphore controls concurrency; a token bucket controls rate:

```typescript
// Pseudocode
const pool = new Semaphore(8)         // max 8 concurrent
const limiter = new RateLimiter(20)   // max 20 req/s

async function fetchBatch(itemIds: number[]) {
  await limiter.acquire()
  return pool.run(() => fetch(...))
}
```

On HTTP 429 response: exponential backoff (1s → 2s → 4s → ...), max 3 retries before skipping the batch and logging a warning.

## Consequences

- Full scan completes in ~25 seconds at the 20,000-item baseline, giving near-real-time data with a 60s cooldown between cycles.
- The 8-connection cap means Phase 1 and Phase 2 share the same pool — they run sequentially (Phase 1 completes, then Phase 2 begins) to avoid exceeding the connection limit.
