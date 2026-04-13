FROM oven/bun:1 AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG PUBLIC_GA_MEASUREMENT_ID=""
ENV PUBLIC_GA_MEASUREMENT_ID=$PUBLIC_GA_MEASUREMENT_ID
RUN bun run build

FROM oven/bun:1

WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/data ./data
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "build/index.js"]
