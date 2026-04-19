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

**Estimates** use Fibonacci points (1, 2, 3, 5, 8, 13). Every new issue must include an estimate.

## Testing: visual and e2e

New pages, routes, and visual changes must include:

- **Playwright e2e tests** following the existing pattern in `tests/e2e/`. Mock external APIs to keep tests offline.
- **Visual verification via Playwright** (navigate + screenshot) before declaring work complete. Use the `playwright-cli` skill for visual verification — don't write custom Playwright scripts when the skill can handle it.

Unit tests alone are not sufficient for UI work.

### Running e2e tests

Run `npx playwright test` — Playwright manages its own dev server with dynamic port allocation (see `playwright.config.ts`). The config captures vite's chosen port via a named regex group (`playwright_test_base_url`) and auto-assigns it to `use.baseURL`, so tests use relative paths like `page.goto('/route')`. **NEVER start a dev server yourself for e2e tests, NEVER kill processes on ports, and NEVER hardcode a port or pass `--base-url`.** The user may have their own dev server running.

## UI changes and responsive design

When modifying UI elements, always consider responsive/mobile behavior (RWD), even for minor fixes.

## Google Analytics

GA4 is integrated via `gtag.js`. When adding new pages or changing routes, ensure page views are tracked correctly — SPA navigation requires manual `page_view` events. See `ENG-130` for prior work on this.

## Git workflow

Full reference — branching model, 2-parent squash topology, shipping recipe, useful commands, and commit-message rules — lives in [`docs/git-workflow.md`](docs/git-workflow.md). Read it before any non-trivial git work.

Quick rules:

- `main` — one squash commit per shipped feature (the first-parent chain is the release log). Tagged `v*` for prod.
- `dev` — fast-forward merges from feature branches; granular history preserved.
- `feat/<ticket>-<slug>` — ephemeral feature branch. Tag pair `feat-<ticket>-{base,merged}` is the durable anchor.
- Ship with `./scripts/ship-to-main.sh <ticket> "<subject>"` — constructs the 2-parent squash commit.
- Never rewrite `dev` or `main`. Never commit to `main` outside the feature-ship workflow.
- Inspect `main` with `git log main --first-parent` (plain `git log main` walks every dev commit pulled in as a second parent).
