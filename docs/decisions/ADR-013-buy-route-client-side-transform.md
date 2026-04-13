# ADR-013: Buy Route as Client-Side Transform

## Context

The buy route feature groups selected arbitrage opportunities by source world so the player can plan an efficient cross-world shopping trip. The question was where to run the grouping logic: server-side (new API endpoint) or client-side (pure transform over already-loaded data).

## Decision

Buy route grouping runs entirely in the browser as a pure function over `Opportunity[]`. No new API endpoint. Selection state, item tracking state (`unchecked`/`bought`/`missing`), and route rendering are all client-side.

## Reasoning

**Why not server-side?**

- The client already has the full opportunity list — grouping by `sourceWorld` / `altSourceWorld` requires no additional data.
- Selection state is inherently per-session and per-user. Sending it to the server would add a round-trip with no benefit.
- A server endpoint would need to serialize route state (which items are selected, tracking state) — state that has no reason to leave the browser.

**Why client-side works:**

- The algorithm is two-pass and O(n): place primary entries, then attach alts. No expensive computation.
- All fields needed (`sourceWorld`, `altSourceWorld`, `altBuyPrice`, confidence, etc.) are already present on `Opportunity`.
- Grouping is deterministic and stateless — same inputs always produce the same route.

## Consequences

- Route data cannot be persisted, shared, or bookmarked server-side without introducing a new storage + API layer.
- If the opportunity model changes (e.g., multi-alt sources), the grouping algorithm in `src/lib/client/route.ts` must be updated — there is no server-side fallback.
- The route modal and floating action bar are purely presentational; they can be redesigned without touching any API contract.
