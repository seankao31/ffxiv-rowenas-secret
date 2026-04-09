# Investigation: Universalis Timestamp Semantics

**Date:** 2026-04-10
**Issue:** ENG-94 — Verify Universalis timestamp semantics for confidence scoring
**Related:** ENG-95 — Fix stale comment in types.ts

## Questions

1. What does `worldUploadTimes` represent? Does it match `lastUploadTime` from per-world queries?
2. Can `worldUploadTimes` and `lastReviewTime` diverge significantly?
3. Is `lastReviewTime` a better proxy for price freshness than `worldUploadTimes`?
4. Is the `types.ts` comment accurate?

## Findings

### worldUploadTimes derivation

`worldUploadTimes` in DC responses is populated by `CurrentlyShownControllerBase.cs:372`:

```csharp
aggWorldUploadTimes[next.WorldId.Value] = next.LastUploadTimeUnixMilliseconds;
```

Where `LastUploadTimeUnixMilliseconds` comes from `BuildPartialView` (line 446):

```csharp
var lastUploadTime = Math.Max(currentlyShown.LastUploadTimeUnixMilliseconds,
    Convert.ToInt64(history.LastUploadTimeUnixMilliseconds));
```

This is `MarketItem.lastUploadTime` — the per-(world, item) upload timestamp in PostgreSQL, updated when an upload client submits data. It is **not** derived from `lastReviewTime`.

For per-world scan strategy, our code synthesizes it as `{ [world.id]: item.lastUploadTime }` — same underlying value.

### lastReviewTime is fake post-7.0

Square Enix removed `lastReviewTime` from the game network packet in Dawntrail (7.0, June 2024). Verified across three codebases:

**Dalamud** (`MarketBoardCurrentOfferings.cs`, commit `3e950b09f`):
- Before 7.0: `listingEntry.LastReviewTime = DateTimeOffset.UtcNow.AddSeconds(-reader.ReadUInt16()).DateTime` — a real uint16 seconds-ago offset from the packet
- After 7.0: `internal DateTime LastReviewTime { get; set; } = DateTime.UtcNow` — hardcoded, marked `[Obsolete("Universalis Compatibility, contains a fake value")]`

**Teamcraft/pcap-ffxiv** (`marketBoardItemListing.ts`):
- `lastReviewTime: 0` with comment "Removed in 7.0; using placeholder value for backwards-compatibility"

**Universalis server** (`MarketBoardUploadBehavior.cs:309-314`):
- `GetLastReviewTime()` falls back to `DateTime.UtcNow` when input is 0 or null

Result: For all post-7.0 data, `lastReviewTime ≈ upload time ≈ lastUploadTime`.

### types.ts comment is wrong

The comment says: "Derived: max(lastReviewTime) across all listings per worldID"

This was never accurate — `worldUploadTimes` always came from `MarketItem.lastUploadTime`, not from listing `lastReviewTime`. Filed ENG-95 to fix.

## Answers

1. `worldUploadTimes[worldID]` = `MarketItem.lastUploadTime` for that world/item pair. Yes, it matches `lastUploadTime` from per-world queries (same source).
2. Post-7.0: No, they cannot meaningfully diverge. Both reflect upload time. Pre-7.0: They could diverge (lastReviewTime was a real game value).
3. No. They are equivalent for current data. Neither is "better."
4. No. The comment is wrong regardless of the lastReviewTime question. Filed ENG-95.

## Action Items

- [x] ENG-95 filed to fix the types.ts comment
- [ ] No changes needed in `scoring.ts` or `crafting.ts` — either timestamp works
