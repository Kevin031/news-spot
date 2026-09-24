ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS build

ARG NPM_REGISTRY=https://registry.npmjs.org
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
ENV COREPACK_NPM_REGISTRY=$NPM_REGISTRY
ENV NPM_CONFIG_REGISTRY=$NPM_REGISTRY
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM ${NODE_IMAGE} AS runtime

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATABASE_PATH=/app/data/news.db
ENV WEB_DIST_PATH=/app/apps/web/dist
WORKDIR /app

RUN groupadd --gid 1001 newsspot && useradd --uid 1001 --gid newsspot --create-home newsspot
COPY --from=build --chown=newsspot:newsspot /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build --chown=newsspot:newsspot /app/node_modules ./node_modules
COPY --from=build --chown=newsspot:newsspot /app/apps/api ./apps/api
COPY --from=build --chown=newsspot:newsspot /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=newsspot:newsspot /app/packages/contracts ./packages/contracts
RUN mkdir -p /app/data && chown newsspot:newsspot /app/data

USER newsspot
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "apps/api/src/server.js"]
