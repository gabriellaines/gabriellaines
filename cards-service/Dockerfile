FROM node:22-alpine

# git is needed to publish the rendered cards back into the profile repo.
# tini reaps zombies and forwards SIGTERM so shutdown flushes the view counter.
RUN apk add --no-cache git ca-certificates tini

WORKDIR /app

# There are no dependencies to install: the service runs on Node's standard
# library alone, so there is no lockfile to drift and no install step to fail.
COPY package.json ./
COPY src ./src

RUN addgroup -S cards && adduser -S -G cards cards \
    && mkdir -p /data/out /data/state /data/repo \
    && chown -R cards:cards /data /app

USER cards

ENV NODE_ENV=production \
    OUT_DIR=/data/out \
    STATE_DIR=/data/state \
    WORK_DIR=/data/repo \
    PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
