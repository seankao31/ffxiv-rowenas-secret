# ffxiv-rowenas-secret

A personal dashboard for cross-world market board arbitrage in Final Fantasy XIV. It scans all worlds in the 陸行鳥 Data Center, finds items cheaper elsewhere than on 利維坦 (home world), and ranks them by expected daily profit.

Data is sourced from the [Universalis](https://universalis.app) API and refreshed continuously (each full scan cycle takes ~2.5 minutes).

## Prerequisites

- [Bun](https://bun.sh) runtime

## Getting started

```sh
# Install dependencies
bun install

# Build the app
bun run build

# Start the server
bun start
```

Then open `http://localhost:3000` in your browser. The first scan takes about 1.5 minutes before results appear (the per-world strategy scans all 8 worlds sequentially — see [ADR-005](docs/decisions/ADR-005-scan-rate-limiting.md)). A progress bar shows the current phase and completion percentage during the initial scan.

## Development

```sh
# Start the dev server
bun run dev

# Start with pre-seeded cache data (skips Universalis scanner)
FIXTURE_DATA=true bun run dev
```

## Tests

```sh
bun run test        # unit tests (vitest)
bun run test:e2e    # E2E tests (Playwright, requires Chromium)
```

## Deployment

The app is containerized via Docker. See the `Dockerfile` and `.github/workflows/` for details.

## Contributing

Branching model, feature-shipping recipe, and useful git commands are in [`docs/git-workflow.md`](docs/git-workflow.md). The short version:

- Feature work happens on `feat/<ticket>-<slug>` branches off `dev`.
- `dev` fast-forwards granular feature history; `main` tracks one squash commit per shipped feature.
- Ship to `main` with `./scripts/ship-to-main.sh <ticket> "<subject>"`.
- Use `git log main --first-parent` to read the release log — plain `git log main` is noisy because each main squash has a second parent pointing into dev.
