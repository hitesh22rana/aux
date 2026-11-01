# syntax=docker/dockerfile:1
FROM node:26.13.0-trixie-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Optional build-only trust for corporate or managed development proxies.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm install --global npm@12.2.1 --cache /tmp/npm-bootstrap \
    && rm -rf /tmp/npm-bootstrap

FROM base AS build
# Native SQLite bindings can build from source when a prebuilt binary is unavailable.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY . .
# Keep development dependencies and install caches out of committed image layers.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --cache /tmp/npm-build \
    && npm run typecheck \
    && npm run build \
    && npm prune --omit=dev --cache /tmp/npm-build \
    && rm -rf /tmp/npm-build .next/cache \
    && mkdir /runtime \
    && mv node_modules .next public src next.config.ts tsconfig.json package.json package-lock.json /runtime/

FROM base AS runtime
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    AUX_DATA_DIR=/app/data
RUN groupadd --gid 1001 aux \
    && useradd --uid 1001 --gid aux --create-home --no-log-init aux \
    && mkdir -p /app/data \
    && chown aux:aux /app/data
COPY --from=build --chown=aux:aux /runtime/ ./
USER aux
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
