import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { counterCard } from './cards.js';
import { errorCard } from './svg.js';
import { log } from './log.js';

/** Fixed-window per-client request limiter. */
class RateLimiter {
  constructor(perMinute) {
    this.perMinute = perMinute;
    this.windows = new Map();
    const timer = setInterval(() => this.windows.clear(), 60_000);
    timer.unref?.();
  }

  check(key) {
    if (this.perMinute <= 0) return true;
    const used = this.windows.get(key) ?? 0;
    if (used >= this.perMinute) return false;
    this.windows.set(key, used + 1);
    return true;
  }
}

const SAFE_NAME = /^[a-z0-9._-]+\.svg$/i;

function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function createServer({ config, counter, state }) {
  const limiter = new RateLimiter(config.rateLimitPerMinute);
  const metrics = { requests: 0, rateLimited: 0, notFound: 0, errors: 0 };

  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    const ip = clientIp(req, config.trustProxy);
    metrics.requests += 1;

    const finish = (status, extra = {}) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      // One JSON line per request: this is the monitoring surface. Grep it, or
      // ship it, to see whether the live endpoints are being abused.
      log.info('request', {
        route,
        status,
        ms: Math.round(ms * 10) / 10,
        ip,
        ua: req.headers['user-agent'] ?? '',
        ref: req.headers.referer ?? '',
        ...extra,
      });
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain' }).end('method not allowed');
      finish(405);
      return;
    }

    if (!limiter.check(ip)) {
      metrics.rateLimited += 1;
      res.writeHead(429, { 'content-type': 'text/plain', 'retry-after': '60' }).end('slow down');
      finish(429);
      return;
    }

    try {
      if (route === '/healthz') {
        const body = JSON.stringify({
          ok: true,
          lastRenderAt: state.lastRenderAt,
          lastRenderOk: state.lastRenderOk,
          lastPublishCommit: state.lastPublishCommit,
          views: counter?.count ?? null,
        });
        res.writeHead(200, { 'content-type': 'application/json' }).end(body);
        finish(200);
        return;
      }

      if (route === '/metrics') {
        const lines = [
          '# HELP cards_requests_total HTTP requests served.',
          '# TYPE cards_requests_total counter',
          `cards_requests_total ${metrics.requests}`,
          '# HELP cards_rate_limited_total Requests rejected by the rate limiter.',
          '# TYPE cards_rate_limited_total counter',
          `cards_rate_limited_total ${metrics.rateLimited}`,
          '# HELP cards_not_found_total Requests for unknown paths.',
          '# TYPE cards_not_found_total counter',
          `cards_not_found_total ${metrics.notFound}`,
          '# HELP cards_profile_views_total Profile view counter value.',
          '# TYPE cards_profile_views_total counter',
          `cards_profile_views_total ${counter?.count ?? 0}`,
          '# HELP cards_render_ok Whether the most recent render succeeded.',
          '# TYPE cards_render_ok gauge',
          `cards_render_ok ${state.lastRenderOk ? 1 : 0}`,
          '# HELP cards_render_timestamp_seconds When the last render finished.',
          '# TYPE cards_render_timestamp_seconds gauge',
          `cards_render_timestamp_seconds ${
            state.lastRenderAt ? Math.floor(new Date(state.lastRenderAt).getTime() / 1000) : 0
          }`,
        ];
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }).end(
          `${lines.join('\n')}\n`,
        );
        finish(200);
        return;
      }

      if (route === '/counter.svg') {
        if (!config.counterEnabled) {
          res.writeHead(404, { 'content-type': 'text/plain' }).end('counter disabled');
          finish(404);
          return;
        }
        const label = (url.searchParams.get('label') ?? 'PROFILE VIEWS')
          .slice(0, 32)
          .toUpperCase();
        const count = counter.increment();
        res
          .writeHead(200, {
            'content-type': 'image/svg+xml; charset=utf-8',
            // Camo caches regardless, but ask for no caching so each fetch counts.
            'cache-control': 'no-cache, no-store, must-revalidate, max-age=0',
          })
          .end(counterCard({ count, label }));
        finish(200, { views: count });
        return;
      }

      if (route.startsWith('/cards/')) {
        const name = route.slice('/cards/'.length);
        if (!SAFE_NAME.test(name)) {
          metrics.notFound += 1;
          res.writeHead(400, { 'content-type': 'text/plain' }).end('bad name');
          finish(400);
          return;
        }
        try {
          const svg = await readFile(path.join(config.outDir, name), 'utf8');
          res
            .writeHead(200, {
              'content-type': 'image/svg+xml; charset=utf-8',
              'cache-control': 'public, max-age=1800',
            })
            .end(svg);
          finish(200);
        } catch {
          metrics.notFound += 1;
          res
            .writeHead(404, { 'content-type': 'image/svg+xml; charset=utf-8' })
            .end(errorCard('Card not rendered yet'));
          finish(404);
        }
        return;
      }

      if (route === '/') {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }).end(
          'profile cards service\n\n' +
            '  /cards/<name>.svg  rendered cards\n' +
            '  /counter.svg       live profile view counter\n' +
            '  /healthz           status\n' +
            '  /metrics           prometheus metrics\n',
        );
        finish(200);
        return;
      }

      metrics.notFound += 1;
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      finish(404);
    } catch (err) {
      metrics.errors += 1;
      log.error('request failed', { route, error: err.message });
      res.writeHead(500, { 'content-type': 'text/plain' }).end('internal error');
      finish(500, { error: err.message });
    }
  });

  return server;
}
