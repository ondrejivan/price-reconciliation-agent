FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter @pra/api build \
 && pnpm --filter @pra/api deploy --prod --legacy /out

# Debian slim rather than Alpine: the Agent SDK ships a native Claude Code
# binary, and the glibc build is the default one it resolves.
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out .
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
