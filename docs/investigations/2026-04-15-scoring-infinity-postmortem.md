# Post-mortem: Infinity→null in scoring API response

**Date:** 2026-04-15
**Ticket:** ENG-146
**Severity:** App-breaking (page stuck loading)

## What happened

ENG-146 removed the `listing_staleness_hours` hard cutoff and simplified scoring filters. As part of this, the `homeListings.length === 0 → continue` guard was removed to allow items with no home listings but positive velocity and sale history to appear as opportunities.

After deploying to main, `bun run dev` with real data produced an API response containing `null` values for `listingPrice` and `listingProfitPerUnit` — these were `Infinity` values that `JSON.stringify` silently converted to `null`. The frontend crashed trying to call `.toLocaleString()` on `null`.

## Root cause

When `homeListings.length === 0`, `cheapestHomePrice` is set to `Infinity`. Two output fields reference it directly:

```typescript
listingPrice: cheapestHomePrice,                                    // Infinity
listingProfitPerUnit: Math.round(cheapestHomePrice * 0.95 - buy),   // Infinity
```

Meanwhile, `realisticSellPrice = min(Infinity, median_history)` is correctly capped by sale history, so `sellPrice` and `profitPerUnit` were fine. The unit tests only asserted on the derived fields (`sellPrice`, `activeCompetitorCount`) and missed the raw ones.

## Why tests didn't catch it

The unit test for "no home listings + sale history" checked:
- `results.length === 1` ✓
- `activeCompetitorCount === 0` ✓  
- `sellPrice === 1000` ✓

But did not check:
- `listingPrice` — was `Infinity` → `null` in JSON
- `listingProfitPerUnit` — was `Infinity` → `null` in JSON

The test verified the *new scoring logic* worked correctly but didn't verify the *full output shape* was JSON-safe.

## Why fixture data didn't catch it

The fixture snapshot had 7 items with no home listings, but all of them had either zero velocity (caught by velocity gate) or sale history (caps the price to a finite value). No fixture item exercised the exact combination of: no home listings + positive velocity + the `listingPrice` output field.

## Fix

Made `listingPrice` and `listingProfitPerUnit` nullable in the `Opportunity` type (`number | null`). When no home listings exist, these fields are genuinely `null` — there is no listing price to report. The UI guards against null before rendering.

Also added fixture items 99901 and 99902 to cover the edge cases.

## Lesson

When removing a guard that previously excluded items from a code path:

1. **Trace every output field** back to its raw source. If any raw value can be `Infinity`, `NaN`, or `undefined` in the new path, the output is corrupt.
2. **`JSON.stringify(Infinity)` returns `null` silently** — no error, no 500, just corrupt data. Test at the JSON boundary, not just the computation.
3. **Fixture data must cover edge cases for the change being made.** Existing fixtures were constructed for the old scoring logic. When the scoring contract changes (new items can flow through), fixtures must be updated to exercise the new paths.
4. **Test the full output shape**, not just the fields the new logic touches. A field you didn't change (`listingPrice`) can still break if it references a value whose domain expanded.
