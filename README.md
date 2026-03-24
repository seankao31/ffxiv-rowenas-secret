# ffxiv-arbitrage

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

Then open `http://localhost:3000` in your browser. The first scan takes about 1.5 minutes before results appear (the per-world strategy scans all 8 worlds sequentially — see [ADR-005](docs/decisions/ADR-005-scan-rate-limiting.md)).

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

## Deployment (EC2 + PM2)

The server is hosted on AWS EC2. `dist/` is not committed to git, so a build step is required on deploy.

**First-time setup:**

```sh
bun install
bun run build:client
pm2 start "bun start" --name ffxiv-arbitrage
pm2 save
pm2 startup   # enable auto-restart on reboot
```

**Updating:**

```sh
git pull
bun install           # if dependencies changed
bun run build:client
pm2 restart ffxiv-arbitrage
```
