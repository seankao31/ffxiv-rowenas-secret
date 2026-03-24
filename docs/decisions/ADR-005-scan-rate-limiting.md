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
Theoretical upper bound (if rate limiter were the sole bottleneck):
Phase 1: ~168 batches × 8 worlds ÷ 20 req/s ≈ 515s (~8.6 min)
Phase 2: ~168 batches ÷ 20 req/s             ≈  74s (~1.2 min)

Empirical (16,736 items, direct connection):
Phase 1: ~84s (8 worlds sequential, ~11s each)
Phase 2: ~12s
Cooldown (default):                           =  60s
──────────────────────────────────────────────────────
Total cycle interval:                         ≈ 156s (~2.6 min)
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

## Empirical Validation (2026-03-24, revised)

Real scan of 16,736 marketable items using the per-world strategy (168 batches × 100 items).

> **Note:** An earlier measurement (299.7s total, ~5 req/s average) was conducted through a VPN, which inflated response latency by ~3×. The data below reflects a direct connection — the authoritative baseline.

### Observed request rates (direct connection)

| Phase | Batches | Time (s) | Avg batch/s |
|-------|---------|----------|-------------|
| Phase 1: 伊弗利特 | 168 | 12.1 | 13.9 |
| Phase 1: 迦樓羅 | 168 | 11.3 | 14.9 |
| Phase 1: 利維坦 | 168 | 11.4 | 14.7 |
| Phase 1: 鳳凰 | 168 | 11.9 | 14.1 |
| Phase 1: 奧汀 | 168 | 11.0 | 15.3 |
| Phase 1: 巴哈姆特 | 168 | 11.4 | 14.7 |
| Phase 1: 拉姆 | 168 | 6.6 | 25.5 |
| Phase 1: 泰坦 | 168 | 8.6 | 19.5 |
| Phase 2 (home) | 168 | 11.6 | 14.5 |
| **Total** | **1,512** | **95.8** | **15.8** |

### Findings

- **Throughput is ~14–15 batch/s for most worlds**, close to the 20 req/s rate limiter cap. With 8 concurrent connections and ~500ms average response time, the pipeline stays well-fed.
- **拉姆 (25.5 batch/s)** and **泰坦 (19.5 batch/s)** are faster because their responses are smaller (fewer or no listings). 拉姆 exceeds the 20 req/s steady-state rate via the token bucket's burst allowance — tokens accumulate during the brief pause between worlds.
- **Burst safety:** Even 拉姆's peak burst stays under the 50 req/s burst cap by a wide margin.
- **Total scan time (95.8s)** is well under the theoretical upper bound of 649s. With the 60s cooldown, cycle interval is ~156s (~2.6 min).
- **The rate limiter is now load-bearing** — without it, throughput would likely hit the 25 req/s hard limit on low-volume worlds. The 5 req/s headroom below the hard limit provides the intended safety buffer.

## Monitoring

Universalis provides a public Grafana dashboard for monitoring per-User-Agent API request rates:

- **URL:** https://monitor.universalis.app/d/3PpqjXv4k/universalis?orgId=1&refresh=30s&var-Job=All&var-Controller=All&from=now-1h&to=now&viewPanel=69
- **Credentials:** guest / guest

To see our scanner's traffic on the dashboard, all Universalis API requests should include a custom `User-Agent` header. This allows us to verify actual request rates and diagnose rate-limiting issues in production.

Source: Universalis community Discord (2026-03-24).
