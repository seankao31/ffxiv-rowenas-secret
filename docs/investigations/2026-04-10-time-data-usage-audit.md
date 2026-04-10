# Investigation: Universalis Time-Data Usage Audit

**Date:** 2026-04-10
**Issue:** ENG-94 — Verify Universalis timestamp semantics for confidence scoring
**Companion to:** [`2026-04-10-universalis-timestamp-semantics.md`](./2026-04-10-universalis-timestamp-semantics.md)

## Motivation

ENG-94 surfaced a stale comment in `types.ts` about how `worldUploadTimes` is derived. Investigating that single comment forced a deeper question: across the whole codebase, how many of our time-related Universalis assumptions are still correct after Square Enix's Dawntrail (7.0) packet changes — and after the per-world scan strategy refactor (ADR-006, ADR-008)?

This document maps every code site that consumes a Universalis timestamp or velocity field against the verified API semantics, calls out drift, and proposes targeted fixes. It serves as:

- The closeout for ENG-94's "if action is needed" branch (questions 1–4 of the original ticket are answered in the timestamp-semantics investigation; this doc covers the audit side).
- A reference for future time-sensitive features (Craft-for-Profit, Retainer Venture Optimizer) that will lean on the same data plumbing.

## Ground truth (from the verified API reference)

| Field | API unit | Meaning post-7.0 |
|---|---|---|
| `lastUploadTime` (item-level) | **ms** | When an uploader last submitted data for this world/item. For DC queries, = `max` across worlds. |
| `worldUploadTimes[worldId]` (DC query) | **ms** | Per-world `MarketItem.lastUploadTime`. Only worlds with rows appear. |
| `listing.lastReviewTime` | **seconds** | Placeholder. Dalamud sends `DateTime.UtcNow` at upload time; effectively equal to `lastUploadTime` for that world. |
| `sale.timestamp` (recentHistory) | **seconds** | Real sale time. |
| `regularSaleVelocity` (CurrentlyShown) | sales/day | Computed over the *returned sale entries*, not over `statsWithin`. Default `entries=5`. |

## Scan strategies — quick recap

The codebase has two scan strategies, selected by `SCAN_STRATEGY`:

- **`per-world` (default)** — Hits `GET /api/v2/{worldName}/{ids}` once per world. 8× more requests, but each payload is ~1/8 the size, and worlds with no listings finish in ~0.4s. Net result: ~26% faster than DC mode (see ADR-006). Per ADR-008, the home-world pass uses `fetchHomeWorldCombined` to extract listings + velocity + history in a single API call, eliminating Phase 2.
- **`dc` (preserved for fallback / benchmarking)** — Hits `GET /api/v2/{dcName}/{ids}` for Phase 1 (returns all 8 worlds merged server-side, plus `worldUploadTimes`), then a separate `GET /api/v2/{homeWorld}/{ids}` for Phase 2 (velocity + history).

This distinction matters for several of the audit findings below — the same line of code has subtly different semantics depending on which strategy is active.

---

## Usage 1 — Ingest normalization (`src/lib/server/universalis.ts`)

**What the code does.** Multiplies `listing.lastReviewTime` by 1000 in all three fetchers (DC, per-world, home-world combined). Leaves `lastUploadTime` and `worldUploadTimes[*]` as-is.

**Assumption vs reality.** ✅ Correct. The API ref confirms `lastReviewTime` is seconds and `lastUploadTime`/`worldUploadTimes` are ms. The conversion is correct at the seam.

### Latent trap — `recentHistory[].timestamp`

```ts
recentHistory: item.recentHistory ?? [],
```

`SaleView.timestamp` is **seconds** per the API ref, but we pass it through to `SaleRecord.timestamp` (`src/lib/shared/types.ts:13`) without conversion or unit annotation.

- **Currently harmless** — no consumer reads `s.timestamp` today (`scoring.ts:56-64` deliberately ignores sale age for the median clamp).
- **But the type doesn't document the unit**, unlike `Listing.lastReviewTime: number  // unix ms`.
- Anyone adding `s.timestamp < cutoffMs` later will be off by 1000×.

**Fix.** Either multiply by 1000 at ingest (consistent with listings) or add a `// unix seconds` comment on the type. Normalizing at the boundary is safer.

---

## Usage 2 — `ItemData.worldUploadTimes` type comment (`src/lib/shared/types.ts:19`)

```ts
// worldID → unix ms. Derived: max(lastReviewTime) across all listings per worldID.
// Only worlds that have at least one listing in Phase 1 appear here.
worldUploadTimes: Record<number, number>
```

**Assumption vs reality.** ❌ Wrong on both counts.

1. **Not derived** from `max(lastReviewTime)`. It's sourced directly from the API's `worldUploadTimes` field (DC mode) or synthesized from `item.lastUploadTime` per world (per-world mode).
2. **"Only worlds with listings"** is also suspect — the API populates `worldUploadTimes` for each world the server merged data from, which is not necessarily "worlds with a current listing".

**Status.** ENG-95 is already filed for this. See the timestamp-semantics investigation doc.

---

## Usage 3 — `homeLastUploadTime` fallback (`src/lib/server/scanner.ts:21-23`)

```ts
const homeLastUploadTime = homeResult.lastUploadTime > 0
  ? homeResult.lastUploadTime
  : (worldUploadTimes[HOME_WORLD_ID] ?? 0)
```

**This fallback is meaningful only in DC mode.** Per-world mode makes it dead code:

- **DC mode** — `worldUploadTimes[HOME]` comes from the DC endpoint response's `worldUploadTimes` map (Phase 1, separate API call). `homeResult.lastUploadTime` comes from the home-world endpoint's `lastUploadTime` field (Phase 2, a different API call). Both ultimately point at the same `MarketItem.lastUploadTime` row in Universalis Postgres, but they arrive via separate requests, so they could legitimately disagree by a few seconds if an upload landed between Phase 1 and Phase 2. The fallback handles the edge case where Phase 2 returns 0 but Phase 1 didn't.
- **Per-world mode** — `fetchHomeWorldCombined` populates *both* `worldUploadTimes[HOME] = item.lastUploadTime` and `homeResult.lastUploadTime = item.lastUploadTime` from **the same field in the same API response**. They're guaranteed equal. The fallback is a no-op.

**Recommendation.** Don't delete the fallback — it costs nothing and protects DC mode. Update the comment to be honest about which strategy each branch protects:

```ts
// In DC mode, Phase 1 (DC endpoint) and Phase 2 (home endpoint) are separate API
// calls; either may legitimately return 0 in edge cases. In per-world mode, both
// values come from the same field in the same response and the fallback is a no-op.
```

---

## Usage 4 — Per-listing staleness prefilter (`src/lib/server/scoring.ts:41, 107`)

```ts
const stalenessCutoff = now - params.listing_staleness_hours * MS_PER_HOUR
// ...
l.lastReviewTime >= stalenessCutoff
```

**Assumption vs reality.** The variable name (`listing_staleness_hours`, default 48h) implies a **per-listing** age check — "this specific listing was last touched within 48h". That was the semantics pre-7.0 when `lastReviewTime` was a real per-listing field tracking when the seller last opened their retainer.

Post-7.0, all listings from the same (world, item) upload share an identical `lastReviewTime ≈ worldUploadTime`. This filter has silently changed meaning:

- **Old semantics (pre-7.0):** exclude individual listings that look stale even when the world's data is fresh (e.g., a seller posted 5 days ago but never relisted).
- **New semantics (post-7.0):** exclude entire worlds' worth of listings whose last upload was >48h ago. It's now a world-level filter applied per listing.

**Is it doing useful work?** Marginally. The confidence decay `exp(-48/12) ≈ 0.018` means a 48h-old source already contributes ~2% to `worldScore` and would never rank near the top. The prefilter mostly hides such opportunities from the candidate list before scoring.

**Recommendation.** Either:

- **(a) Delete** the prefilter and rely on confidence decay. One fewer parameter to tune.
- **(b) Keep** it but rename/comment honestly: it's effectively a "hard cutoff for data-age in hours" floor, not a per-listing check. The parameter name `listing_staleness_hours` is misleading.

Either is defensible. Lean (b) — gives the UI a predictable "nothing older than X" guarantee without relying on score ranking to bury stale rows.

---

## Usage 5 — Source/home confidence decay (`scoring.ts:82, 116-118` + `crafting.ts:98-100`)

```ts
const homeAgeHours = (now - item.homeLastUploadTime) / MS_PER_HOUR
const homeConf = confidence(homeAgeHours, HOME_TIME_CONSTANT_H)      // τ=3h
// ...
const uploadTime = item.worldUploadTimes[worldID] ?? 0
const sourceAgeHours = uploadTime > 0 ? (now - uploadTime) / MS_PER_HOUR : Infinity
const sourceConf = confidence(sourceAgeHours, SOURCE_TIME_CONSTANT_H) // τ=12h
```

**Assumption vs reality.** ✅ Correct. Both `worldUploadTimes[w]` and `homeLastUploadTime` are millisecond timestamps, and we compute `(now_ms - t_ms) / MS_PER_HOUR`. Units match.

**Subtle point on semantics.** "Source age" is *not* "how old is this specific listing" — it's "when did an uploader last open the market board for this world/item". For popular items on active worlds this is effectively real-time; for niche items on low-pop worlds it can be days. The current design treats this correctly.

**Gotcha.** `worldUploadTimes[worldID] ?? 0` → `sourceAgeHours = Infinity` → `sourceConf = exp(-∞/12) = 0`. Worlds missing from `worldUploadTimes` get zero confidence and are silently discarded. That's the right behavior, but if the API ever legitimately omits `worldUploadTimes` entries for worlds with active listings (a future API quirk), arbitrage for those worlds would vanish without warning. Worth knowing if you ever see phantom empty results.

---

## Usage 6 — Velocity assumption (`scoring.ts:48`, `scanner.ts`)

```ts
const velocity = params.hq ? item.hqSaleVelocity : item.regularSaleVelocity
```

**Where it comes from.** `fetchHomeListings` / `fetchHomeWorldCombined` pull `regularSaleVelocity`/`hqSaleVelocity` from the CurrentlyShown endpoint.

**⚠️ Assumption mismatch** per the API reference:

> `regularSaleVelocity` on the **CurrentlyShown** endpoint is computed over the *returned sale entries* (default 5). The Universalis docs note: "This statistic is more useful in historical queries."

So velocity is computed over the 5 most recent sales returned in the response, not over a 7-day window. Our spec/code treats it as "sales per day". This is likely **inaccurate by construction**:

- For fast-moving items, 5 sales span a small fraction of a day → velocity is **over-estimated**.
- For slow items, 5 sales can span weeks → velocity is **under-estimated**.
- Neither scales linearly with the 7-day window a user would intuit from "sales per day".

The arbitrage scoring (`fairShareVelocity`, `turnoverDiscount`, `expectedDailyProfit`) all multiply through this potentially-skewed number. **This is the single biggest unaudited assumption in the time-data chain.**

**Partial mitigation already in place.** As of this audit, the home-world fetchers now request `entries=20` (see `HOME_HISTORY_ENTRIES` in `universalis.ts`), which both stabilizes our local median calculation and gives Universalis a wider sample for its velocity computation. This does not fix the underlying semantic mismatch — it just makes the bias smaller.

**Tracked for full investigation.** Filed as a separate Linear issue. Options on the table:

- **(a)** Migrate velocity reads to the History endpoint, which computes velocity over the full `entriesToReturn` window (more accurate but an extra API call per scan).
- **(b)** Verify whether `statsWithin` on CurrentlyShown actually constrains the velocity window or only stats like average price.
- **(c)** Migrate to the **Aggregated** endpoint's `dailySaleVelocity.dc.quantity` — 4-day window, computed from daily Redis buckets (not entry-count). Already on the table for Craft-for-Profit Rankings per `universalis-data-analysis.md`; aligning arbitrage with it would be consistent.

---

## Usage 7 — Recent-history sale age (`scoring.ts:52-64`)

```ts
// No time-window filter: the API already returns a bounded set,
// and low-velocity items are naturally penalised by the scoring formula.
const relevantHistory = params.hq ? item.recentHistory.filter(s => s.hq) : item.recentHistory
// ... median price, ignoring s.timestamp entirely
```

**Assumption vs reality.** The original comment claimed "~20 entries" but the CurrentlyShown default is 5 — we were computing the median of 5 sales, which is statistically noisy.

**Fixed in this audit.** The home-world fetchers now request `entries=20`, so the median is now genuinely over ~20 entries. The stale "~20 entries" comment was accidentally truthful after the fix.

**Still worth noting.** Median-of-N is stable for the `min(cheapestHome, medianPrice)` clamp because outliers above `cheapestHome` don't matter; only outliers below do. With 20 entries this is robust enough.

---

## Usage 8 — `ListingsTable.svelte` "Last Review" column

```svelte
<th>Last Review</th>
...
<td>{formatRelativeTime(listing.lastReviewTime)}</td>
```

**Assumption vs reality.** ❌ Label is misleading post-7.0. `lastReviewTime` is no longer "when the seller last reviewed their retainer" — it's "when an uploader last opened this world's market board for this item" (≈ `worldUploadTimes[w]`). Practical consequence: **every listing from the same world will show the same "Last Review" time** (they all share the upload event's timestamp), and the user is looking at data freshness, not listing age.

**Fix.** Rename the column to "Updated" or "Data age" and update the tooltip/context. This is a user-facing correctness issue, not just a comment fix.

---

## Summary: action items ranked

| # | Severity | Site | Status |
|---|---|---|---|
| 1 | Code change (this audit) | `universalis.ts` `entries=20` for home calls | ✅ **Done** |
| 2 | Stale documentation | `types.ts:19` `worldUploadTimes` comment | Tracked as ENG-95 |
| 3 | User-visible label drift | `ListingsTable.svelte` "Last Review" column | Open — rename to "Updated" |
| 4 | Comment debt | `scoring.ts:41, 107` `listing_staleness_hours` semantics | Open — add comment or rename param |
| 5 | Latent trap | `universalis.ts` + `types.ts:13` `SaleRecord.timestamp` unit | Open — normalize to ms or annotate |
| 6 | Comment debt | `scanner.ts:21-23` `homeLastUploadTime` fallback rationale | Open — clarify which mode uses each branch |
| 7 | Possibly-incorrect assumption | `scoring.ts:48` velocity source semantics | **Tracked separately as a new Linear issue** |

Items 3–6 are small follow-up edits that could be bundled into a single ENG-94 closeout commit. Item 7 is the substantive open question and warrants its own investigation.
