# syntax=docker/dockerfile:1
#
# Build context is expected to be the repository root, e.g.:
#   docker build -f frontend/Dockerfile .
# docker-compose.yml is configured accordingly.

# ---- deps ----
FROM node:26-alpine AS deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# ---- build ----
FROM node:26-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .
RUN npm run build

# ---- production: static assets served by an unprivileged nginx ----
FROM nginxinc/nginx-unprivileged:1.30-alpine AS production

# Patch the runtime libraries reported by Trivy without changing the nginx line.
USER root
RUN apk upgrade --no-cache brotli-libs curl libcurl libexpat musl musl-utils zlib
USER nginx

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# nginxinc/nginx-unprivileged already runs as the non-root `nginx` user.
