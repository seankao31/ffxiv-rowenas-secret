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

Use a **concurrent request pool capped at 4 connections**, rate-limited to **5 req/s**.

## Rationale

### Why 5 req/s?

The Universalis hard limit is 25 req/s (burst: 50), but the API is a crowdsourced public service. Monitoring the [Grafana dashboard](#monitoring) shows most well-behaved clients (ffxiv-flip-research, Expedition-Bot, saddlebag-datapop, universalis-store) operate at 3–5 req/s. We target 5 req/s to:

- Stay in line with community norms rather than exploiting the technical limit.
- Leave massive headroom for burst retries on 429 responses.
- Be sustainable for long-running continuous scans.

> **History:** Initially set to 20 req/s / 8 concurrent (2026-03-23), reduced to 5 req/s / 4 concurrent (2026-03-24) after observing community traffic patterns on the Grafana dashboard.

### Scan cycle timing (at 20,000-item baseline)

See [ADR-006](ADR-006-per-world-scan-strategy.md) for the per-world vs DC strategy decision. With the per-world default:

```
Theoretical (rate limiter as sole bottleneck):
~168 batches × 8 worlds ÷ 5 req/s            ≈ 269s (~4.5 min)

Expected scan time:                           ≈ 6–7 min
Cooldown (default):                           =  60s
──────────────────────────────────────────────────────
Total cycle interval:                         ≈ 8 min
```

Memory at baseline: 20,000 items × ~5KB ≈ **100MB** — comfortable on any EC2 instance.

## Implementation

A simple async semaphore controls concurrency; a token bucket controls rate:

```typescript
// Pseudocode
const pool = new Semaphore(4)         // max 4 concurrent
const limiter = new RateLimiter(5)    // max 5 req/s

async function fetchBatch(itemIds: number[]) {
  await limiter.acquire()
  return pool.run(() => fetch(...))
}
```

On HTTP 429 response: exponential backoff (1s → 2s → 4s → ...), max 3 retries before skipping the batch and logging a warning.

## Consequences

- The 4-connection cap means Phase 1 and Phase 2 share the same pool — they run sequentially (Phase 1 completes, then Phase 2 begins) to avoid exceeding the connection limit.
- The rate limiter and semaphore are shared across all fetch functions regardless of scan strategy (see [ADR-006](ADR-006-per-world-scan-strategy.md)).

## Empirical Validation

### At 20 req/s (original, 2026-03-24)

Real scan of 16,736 marketable items using the per-world strategy (168 batches × 100 items).

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

This rate was too aggressive relative to community norms observed on the Grafana dashboard. Reduced to 5 req/s — see [Monitoring](#monitoring).

## Monitoring

Universalis provides a public Grafana dashboard for monitoring per-User-Agent API request rates:

- **URL:** https://monitor.universalis.app/d/3PpqjXv4k/universalis?orgId=1&refresh=30s&var-Job=All&var-Controller=All&from=now-1h&to=now&viewPanel=69
- **Credentials:** guest / guest

To see our scanner's traffic on the dashboard, all Universalis API requests should include a custom `User-Agent` header. This allows us to verify actual request rates and diagnose rate-limiting issues in production.

Source: Universalis community Discord (2026-03-24).
