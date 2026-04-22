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

Full reference — branching model, merge topology, commit-message rules, and the release recipe — lives in [`docs/git-workflow.md`](docs/git-workflow.md). Read it before any non-trivial git work.

Quick rules:

- `main` — all features land here via `--no-ff` merges. Tagged `v*` for prod. `main --first-parent` is the release log.
- `feat/<ticket>-<slug>` — ephemeral feature branch off main; lives until merged back.
- Merge to `main` with `--no-ff` and a handcrafted merge commit subject describing what the branch does.
- Release with `./scripts/release.sh [-M | -m | -p | X.Y.Z]` — tags current `package.json` version on HEAD, then bumps `package.json` to the next in-dev version, and pushes. `package.json` always represents work-in-progress, not the last release.
- Never rewrite `main`. Never push directly to `main` outside a feature merge or release.
- Inspect with `git log main --first-parent` (release log). Plain `git log main` walks all commits in second-parent branches.
