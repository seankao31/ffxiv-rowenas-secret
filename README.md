# ffxiv-rowenas-secret

A personal dashboard for cross-world market board arbitrage in Final Fantasy XIV. It scans all worlds in the 陸行鳥 Data Center, finds items cheaper elsewhere than on 利維坦 (home world), and ranks them by expected daily profit.

Data is sourced from the [Universalis](https://universalis.app) API and refreshed continuously (each full scan cycle takes ~2.5 minutes).

## Prerequisites

- [Bun](https://bun.sh) runtime

## Getting started

```sh
# Install dependencies
bun install

# Build the frontend
bun run build:client

# Start the server
bun start
```

Then open `http://localhost:3000` in your browser. The first scan takes about 1.5 minutes before results appear (the per-world strategy scans all 8 worlds sequentially — see [ADR-005](docs/decisions/ADR-005-scan-rate-limiting.md)). A progress bar shows the current phase and completion percentage during the initial scan.

## Development

Run the backend and frontend dev servers separately:

```sh
# Backend (with file-watch reload)
bun run dev:server

# Frontend (Vite HMR)
bun run dev:client
```

## Tests

```sh
bun test
```

## Deployment

The app is containerized via Docker. See the `Dockerfile` and `.github/workflows/` for details.
