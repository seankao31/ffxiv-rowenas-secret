# Scoring Staleness Redesign

**Date:** 2026-04-15
**Related:** ENG-94, ADR-004

## Problem

ADR-004 designed the scoring formula with the assumption that `lastReviewTime` is a per-listing freshness signal — reflecting when each individual retainer listing was last reviewed. This assumption is wrong post-Dawntrail (7.0): `lastReviewTime` is now effectively the per-world upload time, identical for all listings from the same world. The consequences:

1. **`listing_staleness_hours` doesn't detect dead retainers.** It was designed to exclude "players who set prices and never update them." Post-7.0, it's a world-level data-age gate: either all listings from a world pass or none do.

2. **The hard cutoff penalizes low uploader coverage, not stale markets.** A world where nobody has the Dalamud plugin could have perfectly valid prices that haven't been re-uploaded. The cutoff wrongly excludes them entirely.

3. **The hard cutoff is redundant with confidence decay.** At 48h, source confidence is ~0.018 — already effectively zero. The exponential decay handles staleness gracefully; the binary cutoff adds no signal.

4. **Two-stage competitor filtering is unnecessary.** The "active listings" pre-filter (price threshold × cheapest + staleness) feeds into a second competitor count (price threshold × realistic sell price). The first stage adds complexity without value.

5. **Source-world price threshold filtering is pointless.** The code filters source listings by `price_threshold × cheapest`, then takes the min — which would be the same min without the filter.

## Changes

### Remove `listing_staleness_hours`

Delete the parameter from `ThresholdParams` and all code paths. Confidence decay is the sole staleness mechanism.

### Simplify competitor counting

**Before:** Two stages — filter by `cheapest × price_threshold` AND `staleness cutoff` → "active listings," then recount against `realistic_sell_price × price_threshold` → competitors.

**After:** One stage — all home listings where `price <= realistic_sell_price × price_threshold` → competitors.

`price_threshold` remains user-configurable. Its sole remaining purpose is defining competitor radius.

### Remove home listing gate

The `if (activeHomeListings.length === 0) continue` gate is removed. Items with zero home listings but positive velocity and sale history are valid opportunities (zero competition, sell price from history). The existing `velocity === 0` check already excludes unscorable items.

### Remove source-world filtering

Source world scoring just finds the cheapest listing per world and computes profit. No `price_threshold` or staleness filtering. Same for the vendor-sell pass.

### Score formula

Unchanged:

```
score = profit_per_unit × fair_share_velocity
      × home_confidence × source_confidence
      × turnover_discount
```

### What stays the same

- Confidence decay functions (τ=3h home, τ=12h source)
- Turnover discount
- Realistic sell price (`min(cheapest_home_listing, median_recent_sale)`)
- Unit cap (`ceil(fair_share_velocity × days_of_supply)`)
- Vendor-sell pass (same simplification, logic otherwise unchanged)
- `price_threshold` and `days_of_supply` remain configurable

### User-visible change

`listing_staleness_hours` disappears from the dashboard settings controls. No other UI changes.

## ADR-004 corrections

Update the following sections to reflect post-7.0 reality:

1. **Per-World Data Age Derivation** — `worldUploadTimes` comes from the Universalis API response (DC queries) or is synthesized from `lastUploadTime` (per-world queries). Not derived from `max(lastReviewTime)`.
2. **Active Competitor Count** — rewrite to single-stage filter, remove dead retainer framing.
3. **Staleness Asymmetry** — remove `listing_staleness_hours` references, note that confidence decay is now the sole mechanism.
4. **Configurable Thresholds** — remove `listing_staleness_hours` row.
5. **Cache Shape** — remove "derived from max lastReviewTime per world" comment.
6. **Formula pseudocode** — remove source-side price threshold filter.

## Testing

- Update existing scoring tests: remove `listing_staleness_hours` from `ThresholdParams` fixtures, verify previously-filtered listings now participate (discounted by confidence)
- New test: zero home listings with positive velocity and sale history → opportunity with 0 competitors
- New test: source world uses cheapest listing without price threshold filtering
- E2e: verify `listing_staleness_hours` control is removed from settings UI
