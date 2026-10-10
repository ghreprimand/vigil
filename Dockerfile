FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json drizzle.config.ts ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/views ./src/views
COPY public ./public
COPY drizzle ./drizzle
COPY docker-entrypoint.sh ./

# Data directory for the SQLite database. Owned by the runtime user so a fresh
# named volume mounted here inherits writable permissions.
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
