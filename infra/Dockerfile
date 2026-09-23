FROM node:22.18.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.34.5 --activate
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY prisma ./prisma
COPY scripts ./scripts
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ARG VITE_APP_ENV=production
ENV VITE_APP_ENV=$VITE_APP_ENV
RUN pnpm build

FROM node:22.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV APP_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]

FROM caddy:2.10-alpine AS web
COPY infra/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv

