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

**Branches:**

- `main` — squashed commits, one per shipped feature. Tagged `v*` for prod deploy.
- `dev` — fast-forward merges from feature branches; full granular history.
- `feat/<ticket>-<slug>` — temporary; lives until the feature ships to main.

`main` and `dev` live in **disjoint SHA universes**. A feature exists once on `dev` as N granular commits and once on `main` as a single squash commit; git sees them as unrelated ancestors. This is intentional. **Never** `git merge dev` into `main` or vice versa.

**Per-feature lifecycle:**

1. Create worktree off `dev` tip:
   ```sh
   git worktree add .worktrees/<ticket> -b feat/<ticket>-<slug> dev
   ```
2. Work and commit freely on the feature branch.
3. When done, rebase `feat/<ticket>-<slug>` onto current `dev` tip, then on `dev`:
   ```sh
   git merge --ff-only feat/<ticket>-<slug>
   git push
   ```
4. Tag the merged tip as a SHA anchor (survives branch deletion):
   ```sh
   git tag feat-<ticket>-merged feat/<ticket>-<slug>
   git push --tags
   ```
5. Bake on `dev` alongside other in-flight features. (When Phase 2 staging is added, `dev` tip will auto-deploy to `staging.ffxivrowena.com`.)
6. When ready to ship, on `main`:
   ```sh
   git merge --squash feat/<ticket>-<slug>
   git commit  # Conventional Commits subject + Ref: trailer
   git push
   ```
7. Tag for prod deploy:
   ```sh
   git tag v0.x.y
   git push --tags
   ```
8. Delete the feature branch and worktree. The `feat-<ticket>-merged` tag remains.

**Tags are always manual.** No workflow tags on your behalf.

**Full design:** `docs/superpowers/specs/2026-04-17-git-workflow-and-staging-design.md`.

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
