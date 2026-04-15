# Rowena's Secret

FFXIV cross-world market board arbitrage dashboard for the 陸行鳥 Data Center.

## Commands

- `bun run test` — run the vitest test suite. **NEVER use bare `bun test`** — that invokes bun's native test runner which ignores vitest config.
- `bun run dev` — start the dev server (auto-downloads game data)
- `bun run build` — production build (auto-downloads game data)
- `bun run download-data` — download FFXIV_Market msgpack files to `data/`
- `FIXTURE_DATA=true bun run dev` — start the dev server with pre-seeded cache data (skips Universalis scanner)

## Linear

**Initiative:** Rowena's Secret
**Team:** Engineering

| Project | Scope |
|---------|-------|
| Arbitrage | Core arbitrage scanning, profit calculation, and market board dashboard |
| Shared Infrastructure | Shared data pipelines and components (recipe data, item search) |
| Item Detail | Per-item market data page — cross-world listings, sale history, price stats |
| Crafting Optimizer | Cheapest way to craft an item — cross-world sourcing, recursive craft-vs-buy |
| Craft-for-Profit Rankings | Rank craftable items by profitability vs. selling price and velocity |
| Retainer Venture Optimizer | Most profitable retainer venture dispatches by job, level, and loot prices |
| Monetization & Analytics | Google Ads, Google Analytics, traffic tracking, and revenue |

## Testing: visual and e2e

New pages, routes, and visual changes must include:

- **Playwright e2e tests** following the existing pattern in `tests/e2e/`. Mock external APIs to keep tests offline.
- **Visual verification via Playwright** (navigate + screenshot) before declaring work complete. Use the `playwright-cli` skill for visual verification — don't write custom Playwright scripts when the skill can handle it.

Unit tests alone are not sufficient for UI work.

### Running e2e tests

Run `npx playwright test` — Playwright manages its own dev server with dynamic port allocation (see `playwright.config.ts`). **NEVER start a dev server yourself for e2e tests, and NEVER kill processes on ports.** The user may have their own dev server running.

## UI changes and responsive design

When modifying UI elements, always consider responsive/mobile behavior (RWD), even for minor fixes.

## Git workflow

- **Rebase before merge.** When integrating a feature branch into main, rebase the branch onto main first so the merge is a fast-forward. Keep history linear.

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`

**Scopes** are coarse, stable, and map to architectural boundaries — not features or tickets:

| Scope | Area |
|-------|------|
| `server` | `src/lib/server/`, `src/routes/api/` — scanning, scoring, caching, recipes, crafting |
| `ui` | `src/lib/client/`, `src/lib/components/`, `src/routes/` (pages) — Svelte components, client logic |
| `e2e` | `tests/e2e/` — Playwright tests |
| `infra` | Docker, CI/CD, Caddy, deploy scripts |
| _(omit)_ | Docs-only, config, or multi-area changes |

Unit tests follow their source scope (`tests/server/` → `server`, `tests/client/` → `ui`).

**Linear ticket references** go in a `Ref:` trailer, not in the scope or subject:

```
feat(ui): add side radio picker to SetupView

Ref: ENG-85
```
