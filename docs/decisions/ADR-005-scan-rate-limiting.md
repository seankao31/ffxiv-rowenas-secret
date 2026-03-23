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

### Scan strategy: per-world vs DC endpoint

**Update (2026-03-24):** Benchmarks with 500 items showed the per-world strategy (`/v2/{worldName}/{ids}`) is ~28% faster than the DC strategy (`/v2/{dcName}/{ids}`) for Phase 1:

- **DC endpoint:** 21.4s Phase 1 (0.2 batch/s) — large payloads with all 8 worlds
- **Per-world:** 15.4s Phase 1 (1.8–2.8 batch/s per world) — small payloads, 8 sequential worlds

Per-world is now the default (`SCAN_STRATEGY=per-world`). The DC codepath is preserved and selectable via `SCAN_STRATEGY=dc` for fallback.

### Scan cycle timing (at 20,000-item baseline)

Per-world strategy (default):
```
Phase 1: ~168 batches × 8 worlds ÷ 20 req/s ≈ 515s (~8.6 min)
Phase 2: ~168 batches ÷ 20 req/s             ≈  74s (~1.2 min)
Configurable cooldown (default)               =  60s
──────────────────────────────────────────────────────
Total cycle interval:                         ≈ 649s (~10.8 min)
```

DC strategy (legacy):
```
Phase 1: ~168 batches ÷ 20 req/s ≈ 713s (~11.9 min)
Phase 2: ~168 batches ÷ 20 req/s ≈  74s (~1.2 min)
Configurable cooldown (default)   =  60s
──────────────────────────────────────────────
Total cycle interval:             ≈ 847s (~14.1 min)
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

- With the per-world strategy, a full scan completes in ~8.6 min for Phase 1 + ~1.2 min for Phase 2 at the 20,000-item baseline. With a 60s cooldown, total cycle interval is ~10.8 min.
- The 8-connection cap means Phase 1 and Phase 2 share the same pool — they run sequentially (Phase 1 completes, then Phase 2 begins) to avoid exceeding the connection limit.
- Per-world processes worlds sequentially but batches within each world concurrently, balancing throughput with API courtesy.
