# ADR-003: Persistence — In-Memory Cache (No Database for v1)

**Status:** Accepted
**Date:** 2026-03-23

## Context

The scanner produces a raw dataset of ~20,000 items (~100MB) each scan cycle (infrastructure sizing baseline — see ADR-005). This data needs to be accessible to the scoring endpoint. SQLite and Redis were considered as persistence layers.

## Alternatives Considered

### A) In-memory cache only *(chosen)*
Raw scan data stored as a typed TypeScript object in the process heap. Lost on restart; repopulated within ~20s.

### B) SQLite
Embedded relational database (no separate service). Data persists to disk across restarts. Enables historical tracking (price trends over time, consistently profitable items).

### C) Redis
In-memory key-value store with persistence options. Supports pub/sub. Requires running a separate service on EC2.

## Decision

**Option A for v1 — in-memory cache only.**

SQLite is identified as a natural v2 upgrade.

## Rationale

- **Redis** is eliminated: its primary strengths are multi-process state sharing (not needed in the monolith) and pub/sub messaging (not needed with REST polling).
- **SQLite** has genuine future value for: (1) historical price trend analysis — "this item has been cheap on 巴哈姆特 for 3 hours" is a stronger signal than a single scan; (2) item metadata caching (item names, categories) that doesn't need re-fetching on restart. However, implementing it before the core scanner works would be premature.
- The ~25s cold-start repopulation time on restart is acceptable for a personal tool (per ADR-005 scan timing calculation).

## Consequences

- Restart requires a fresh scan cycle before results appear.
- No historical data in v1 — trend analysis deferred to v2.
- Adding SQLite later is non-disruptive: the in-memory cache structure maps naturally to a database schema.
