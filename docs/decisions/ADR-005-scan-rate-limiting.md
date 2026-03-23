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

See [ADR-006](ADR-006-per-world-scan-strategy.md) for the per-world vs DC strategy decision. With the per-world default:

```
Phase 1: ~168 batches × 8 worlds ÷ 20 req/s ≈ 515s (~8.6 min)
Phase 2: ~168 batches ÷ 20 req/s             ≈  74s (~1.2 min)
Configurable cooldown (default)               =  60s
──────────────────────────────────────────────────────
Total cycle interval:                         ≈ 649s (~10.8 min)
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

- The 8-connection cap means Phase 1 and Phase 2 share the same pool — they run sequentially (Phase 1 completes, then Phase 2 begins) to avoid exceeding the connection limit.
- The rate limiter and semaphore are shared across all fetch functions regardless of scan strategy (see [ADR-006](ADR-006-per-world-scan-strategy.md)).

## Empirical Validation (2026-03-24)

Real scan of 16,736 marketable items using the per-world strategy (168 batches × 100 items):

### Observed request rates

| Phase | Batches | Time (s) | Avg req/s |
|-------|---------|----------|-----------|
| Phase 1: 伊弗利特 | 168 | 36.0 | 4.67 |
| Phase 1: 迦樓羅 | 168 | 33.8 | 4.97 |
| Phase 1: 利維坦 | 168 | 37.7 | 4.46 |
| Phase 1: 鳳凰 | 168 | 41.0 | 4.10 |
| Phase 1: 奧汀 | 168 | 40.6 | 4.14 |
| Phase 1: 巴哈姆特 | 168 | 46.1 | 3.64 |
| Phase 1: 拉姆 | 168 | 8.9 | **18.88** |
| Phase 1: 泰坦 | 168 | 19.9 | 8.44 |
| Phase 2 (home) | 168 | 35.6 | 4.72 |
| **Total** | **1,512** | **299.7** | **5.04** |

### Findings

- **Response latency, not the rate limiter, is the dominant bottleneck** for most worlds. With 8 connections and ~2s response times, throughput settles around 4–5 req/s — well below the 20 req/s cap.
- **拉姆 (18.88 req/s)** is the exception: the API responded fast enough (likely cache-warm or lower listing volume) that the 20 req/s token bucket became the actual constraint. Even at this peak, we remain under the 25 req/s sustained limit with 6 req/s headroom.
- **Burst safety:** The worst-case burst (~20 req/s from the token bucket) is well under the 50 req/s burst cap.
- **Total cycle time (299.7s)** came in significantly under the 20,000-item theoretical estimate of 649s, because the 16,736 actual item count is smaller and most worlds' response latency keeps throughput below the rate cap.
