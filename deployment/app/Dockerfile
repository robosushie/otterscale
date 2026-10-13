FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /src
COPY package.json pnpm-workspace.yaml ./
COPY packages/app ./packages/app
RUN pnpm install --filter @otterscale/app...
RUN pnpm --filter @otterscale/app build

FROM caddy:2-alpine
COPY --from=build /src/packages/app/dist /srv
COPY deployment/app/Caddyfile /etc/caddy/Caddyfile
EXPOSE 3000
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
