# The ratings server. Build from the repository root, since it shares code with the extension:
#   docker build -f server/Dockerfile -t popscore-server .
#   docker run -p 8787:8787 -v popscore-cache:/data -e TMDB_KEY=… -e OMDB_KEY=… popscore-server
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# No postinstall: `wxt prepare` is only needed for the extension.
RUN npm ci --ignore-scripts
COPY src ./src
COPY server ./server
RUN npm run server:build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8787 DB_PATH=/data/cache.db
COPY --from=build /app/dist/server ./
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 8787
CMD ["node", "index.mjs"]
