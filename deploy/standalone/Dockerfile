# Otterscale standalone — Headscale + console + Caddy + tsnet in one container.
#
# Railway / Render:
#   Dockerfile path: deploy/standalone/Dockerfile
#   Persistent disk: /data
#   The platform sets PORT; Caddy listens there (HTTP). Set AUTH_URL,
#   OTTERSCALE_DOMAIN, CONSOLE_HOST, and HS_HOST to the public HTTPS origins.
#
# Local: pnpm deploy:standalone (80/443 + loopback 8080 → Headscale).

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
ENV DATABASE_URL=file:./prisma/build.db
RUN pnpm run build

FROM golang:1.25-bookworm AS proxy
WORKDIR /src
ENV GOTOOLCHAIN=local CGO_ENABLED=0
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN go build -o /out/proxy ./cmd/proxy

FROM headscale/headscale:0.23.0 AS headscale
FROM caddy:2-alpine AS caddy

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=127.0.0.1
RUN apk add --no-cache ca-certificates openssl wget jq \
  && npm install -g prisma@6.19.0 \
  && mkdir -p /etc/headscale /etc/caddy /var/run/headscale /data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=proxy /out/proxy /usr/local/bin/proxy
COPY --from=headscale /ko-app/headscale /ko-app/headscale
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY deploy/headscale/config.yaml /etc/headscale/config.yaml
COPY deploy/headscale/policy.hujson /etc/headscale/policy.hujson
COPY deploy/headscale/bootstrap.sh /bootstrap.sh
COPY deploy/standalone/Caddyfile /etc/caddy/Caddyfile
COPY deploy/standalone/Caddyfile.paas /etc/caddy/Caddyfile.paas
COPY deploy/standalone/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh /bootstrap.sh \
  && chmod +x /entrypoint.sh /bootstrap.sh /ko-app/headscale /usr/local/bin/proxy /usr/bin/caddy

EXPOSE 80 443 18080
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
