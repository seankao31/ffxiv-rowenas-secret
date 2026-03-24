# ADR-008: Merge Home World Fetch — Eliminate Redundant Phase 2

**Status:** Accepted
**Date:** 2026-03-24

## Context

The scan cycle has two phases:

- **Phase 1:** Fetch listings from all 8 DC worlds (including 利維坦, the home world).
- **Phase 2:** Fetch velocity and sale history from 利維坦.

Both phases call the same Universalis endpoint (`/api/v2/利維坦/{ids}`) for the home world. The API returns all fields — `listings`, `regularSaleVelocity`, `hqSaleVelocity`, `recentHistory` — in a single response. However:

- `fetchWorldListings` (Phase 1) destructures only `listings` and `lastUploadTime`, discarding velocity/history.
- `fetchHomeListings` (Phase 2) destructures only velocity and history fields, discarding listings.

This means 利維坦 data is fetched **twice per scan cycle**, with each pass throwing away what the other needs.

### Cost of the redundancy

With ~16,700 marketable items at batch size 100, Phase 2 issues ~168 additional HTTP requests to Universalis per cycle. Based on ADR-006 benchmarks:

| Metric | Value |
|--------|-------|
| Phase 2 time (direct connection) | ~11.6s |
| Phase 2 requests per cycle | ~168 |
| Fraction of total scan requests | ~11% (168 of ~1,512) |

## Decision

Extract both listings **and** velocity/history from the Phase 1 response when scanning 利維坦. Skip Phase 2 entirely in the per-world strategy.

For the DC strategy (`SCAN_STRATEGY=dc`), Phase 2 remains unchanged — the DC endpoint returns aggregated data that does not include per-world velocity/history.

## Implementation

1. **`universalis.ts`**: Add a new return type or extend `fetchWorldListings` to optionally return home-specific fields (`regularSaleVelocity`, `hqSaleVelocity`, `recentHistory`) when scanning the home world.
2. **`scanner.ts` (`runScanCyclePerWorld`)**: When iterating worlds and reaching 利維坦, capture the extra fields from the response. After Phase 1, only run Phase 2 for items that were missing from 利維坦's Phase 1 results (if any), or skip Phase 2 entirely.
3. **`buildItemData`**: No changes needed — it already accepts home result fields as a parameter.

## Consequences

- ~11% fewer Universalis API requests per scan cycle.
- Scan cycle time reduced by ~11s (the full Phase 2 duration).
- Slightly more complex data extraction in the 利維坦 pass of Phase 1, but no new API calls or endpoints.
- The DC strategy codepath is unaffected.
