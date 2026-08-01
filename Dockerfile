# Build + run the stdio MCP server. No token is needed to start: the server lists
# its tools without credentials (so registries can introspect it), and requires
# WEEEK_API_TOKEN only when a tool actually calls the WEEEK API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
ENTRYPOINT ["node", "dist/index.js"]
