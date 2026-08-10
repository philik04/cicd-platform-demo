# syntax=docker/dockerfile:1
#
# Build context is expected to be the repository root, e.g.:
#   docker build -f backend/Dockerfile .
# docker-compose.yml is configured accordingly.

# ---- deps: install full dependency tree used to build ----
FROM node:26-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY backend/package.json backend/package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript and generate the Prisma client ----
FROM node:26-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ .
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

# ---- production: minimal runtime image ----
FROM node:26-alpine AS production
WORKDIR /app
RUN apk add --no-cache openssl \
    && addgroup -S appgroup \
    && adduser -S appuser -G appgroup \
    # npm is not used at runtime (the entrypoint invokes Prisma's CLI
    # directly via node - see docker/backend-entrypoint.sh) and Trivy
    # otherwise flags CVEs in npm's own bundled dependencies, not ours.
    # node itself is untouched; only npm/npx and their package directory
    # go.
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx

COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/prisma ./prisma
COPY --from=build --chown=appuser:appgroup /app/package.json ./package.json
COPY --chown=appuser:appgroup docker/backend-entrypoint.sh /app/entrypoint.sh
COPY --chown=appuser:appgroup docker/backend-healthcheck.js /app/healthcheck.js

RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
EXPOSE 4000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node /app/healthcheck.js

ENTRYPOINT ["/app/entrypoint.sh"]
