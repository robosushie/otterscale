# Otterscale standalone — Headscale, core, static console, and tsnet in one container.

FROM node:22-alpine AS app
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /src
COPY package.json pnpm-workspace.yaml ./
COPY packages/app ./packages/app
RUN pnpm install --filter @otterscale/app...
RUN pnpm --filter @otterscale/app build

FROM golang:1.25-bookworm AS core
WORKDIR /src/packages/core
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
COPY packages/core ./
RUN go mod download && go build -o /out/core ./cmd/core

FROM golang:1.25-bookworm AS proxy
WORKDIR /src
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
COPY packages/edge ./
RUN go mod download && go build -o /out/proxy ./cmd/proxy

FROM headscale/headscale:0.23.0 AS headscale
FROM caddy:2-alpine AS caddy

FROM alpine:3.22
RUN apk add --no-cache ca-certificates openssl wget jq \
  && mkdir -p /etc/headscale /etc/caddy /var/run/headscale /data /srv
COPY --from=app /src/packages/app/dist /srv
COPY --from=core /out/core /usr/local/bin/core
COPY --from=proxy /out/proxy /usr/local/bin/proxy
COPY --from=headscale /ko-app/headscale /ko-app/headscale
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY deployment/app/Caddyfile /etc/caddy/app.Caddyfile
COPY deployment/headscale/config.yaml /etc/headscale/config.yaml
COPY deployment/headscale/policy.hujson /etc/headscale/policy.hujson
COPY deployment/headscale/bootstrap.sh /bootstrap.sh
COPY deployment/standalone/Caddyfile /etc/caddy/Caddyfile
COPY deployment/standalone/Caddyfile.paas /etc/caddy/Caddyfile.paas
COPY deployment/standalone/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r$//' /entrypoint.sh /bootstrap.sh /etc/caddy/app.Caddyfile \
  && chmod +x /entrypoint.sh /bootstrap.sh /ko-app/headscale /usr/local/bin/proxy /usr/local/bin/core /usr/bin/caddy
EXPOSE 80 443 18080
VOLUME ["/data"]
ENTRYPOINT ["/entrypoint.sh"]
