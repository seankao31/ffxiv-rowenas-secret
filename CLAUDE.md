# Rowena's Secret

FFXIV cross-world market board arbitrage dashboard for the 陸行鳥 Data Center.

## Commands

- `bun run test` — run the vitest test suite. **NEVER use bare `bun test`** — that invokes bun's native test runner which ignores vitest config.
- `bun run dev` — start the dev server
- `bun run build` — production build

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
