# ADR-006: Per-World Scan Strategy

**Status:** Accepted
**Date:** 2026-03-24
**Supersedes:** N/A (new decision; DC-level fetching was the implicit default before this ADR)

## Context

Phase 1 of the scan cycle fetches cross-world listings from the Universalis API. Two endpoint options exist:

- **DC endpoint** (`/v2/{dcName}/{ids}`): Returns listings for all worlds in the data center in one response. Large JSON payloads (~all 8 worlds' listings per batch).
- **Per-world endpoint** (`/v2/{worldName}/{ids}`): Returns listings for a single world. Small payloads, but requires 8× more requests to cover the DC.

The original implementation used the DC endpoint. At ~16,700 items (168 batches), Phase 1 took ~5.6 min extrapolated, with each batch averaging ~2s due to payload size.

## Decision

Use the **per-world strategy** as the default scan approach. Fetch each of the 8 worlds sequentially, with all batches within a world running concurrently (sharing the existing rate limiter and semaphore from [ADR-005](ADR-005-scan-rate-limiting.md)).

The DC codepath is preserved and selectable via `SCAN_STRATEGY=dc` environment variable for fallback or future comparison.

## Rationale

### Benchmark results (500 items, 5 batches)

| Metric | DC | Per-world |
|--------|-----|-----------|
| Phase 1 time | 21.4s | 15.4s |
| Phase 1 batch rate | 0.2 batch/s | 1.8–2.8 batch/s per world |
| Phase 2 time | 3.2s | 2.2s |
| Total time | 25.6s | 19.0s |
| Throughput | 19 items/s | 26 items/s |

**Per-world is ~28% faster on Phase 1 and ~26% faster overall.**

### Full-scan validation (16,736 items, direct connection)

| Phase | Time (s) |
|-------|----------|
| Phase 1 (8 worlds) | 84.2 |
| Phase 2 (home) | 11.6 |
| **Total** | **95.8** |

Per-world Phase 1 breakdown: most worlds ~11s, 拉姆 6.6s (empty), 泰坦 8.6s (sparse). See [ADR-005](ADR-005-scan-rate-limiting.md) for detailed per-world throughput data.

### Per-world breakdown (500 items)

| World | Time | Listings |
|-------|------|----------|
| 伊弗利特 | 2.8s | 1,856 |
| 迦樓羅 | 2.3s | 1,784 |
| 利維坦 | 2.2s | 1,795 |
| 鳳凰 | 2.3s | 1,647 |
| 奧汀 | 1.8s | 1,675 |
| 巴哈姆特 | 2.0s | 1,684 |
| 拉姆 | 0.4s | 0 |
| 泰坦 | 1.5s | 415 |

### Why per-world is faster despite 8× more HTTP requests

- DC endpoint payloads contain all 8 worlds' listings → large JSON parse cost and transfer time (~2s per batch).
- Per-world payloads are ~1/8 the size → response times match Phase 2 speeds (~0.4s per batch).
- Worlds with few or no listings (拉姆) complete nearly instantly, naturally skipping dead data.
- The rate limiter is the bottleneck, not request count — smaller responses complete faster, freeing slots sooner.

### Why sequential worlds, not parallel?

Running all 8 worlds concurrently would exceed the connection semaphore and rate limit, causing heavy queuing. Sequential worlds with concurrent batches stays within the limits established in ADR-005.

## Implementation

```typescript
type ScanStrategy = 'dc' | 'per-world'
const SCAN_STRATEGY: ScanStrategy = (process.env['SCAN_STRATEGY'] as ScanStrategy) || 'per-world'
```

- `fetchWorldListings(world, itemIds)` — new function, same return shape as `fetchDCListings`
- `runScanCyclePerWorld(itemIds)` — iterates worlds, merges into `Map<itemID, {listings, worldUploadTimes}>`
- `startScanner()` dispatches to the appropriate cycle function based on `SCAN_STRATEGY`

The `ItemData` shape is unchanged — downstream code (scoring, API, client) is unaffected.

## Consequences

- Phase 1 scan time: ~84s empirically (16,736 items, direct connection). The theoretical upper bound at 20 req/s is ~8.6 min, but actual throughput reaches ~14–15 batch/s.
- Total HTTP requests increase from ~168 to ~1,344 for Phase 1, but each is cheaper.
- The DC codepath remains available for regression testing or if Universalis changes API behavior.
- Per-world gives natural per-world progress logging, making it easier to identify slow or dead worlds.
