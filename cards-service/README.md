# Profile cards service

Renders the data-driven cards for the profile README and commits them into this
repository. It runs on the VPS, not on anyone else's infrastructure.

## Why it exists

The README used to fetch its cards from free public instances of
`github-readme-stats`, `github-readme-activity-graph`, `streak-stats`,
`capsule-render` and `shields.io`. One of them, the activity graph, was taken
offline mid-2026 and started answering `HTTP 402 DEPLOYMENT_DISABLED`, which
broke the profile and failed the scheduled workflow.

Two changes came out of that:

- **Static images are vendored.** Badges, header and footer banners and the
  typing animation are the same bytes on every request, so they are fetched once
  by `tools/vendor-assets.mjs` and committed under `profile/assets/`.
- **Data cards are rendered here.** Stats, languages, streak, activity graph and
  repo pins need fresh data, so this service renders them on a schedule and
  pushes the SVGs into `profile/`.

The README only ever references committed files. Nothing third-party is fetched
when someone views the profile, and nothing breaks if this service is down: the
cards already in the repository stay exactly as they are.

## Design notes

**No dependencies.** The service uses only the Node standard library, so there
is no `package-lock.json` to drift and no install step to fail. That is a direct
response to what broke the previous setup: the upstream generator's lockfile was
out of sync with its `package.json`, which npm 11 refuses to install.

**Failure keeps the last good card.** A render cycle that throws is logged and
swallowed. Cards are only overwritten when a fresh render succeeds, so an API
outage or an expired token degrades to stale cards rather than broken ones.

**The view counter is the one live endpoint.** A committed file cannot count its
own views, so `/counter.svg` is served from here and its tally is persisted.
Everything else is a static file by the time the README reads it.

## Endpoints

| Path | Purpose |
| --- | --- |
| `/counter.svg` | Live profile view counter; increments per request |
| `/cards/<name>.svg` | The most recently rendered card |
| `/healthz` | Last render time, whether it succeeded, last pushed commit |
| `/metrics` | Prometheus metrics, including rate-limited request counts |

## Monitoring

Every request is logged as one JSON line with route, status, duration, client IP,
user agent and referer:

```
docker logs -f profile-cards | grep '"msg":"request"'
```

Two rate limiters sit in front of the endpoints: Traefik sheds abuse at the edge
(30 req/s average, 60 burst) and the service applies a per-client per-minute cap
(`RATE_LIMIT_PER_MINUTE`, default 60). `cards_rate_limited_total` in `/metrics`
shows how often either fires.

If the live endpoints are ever abused, remove the `traefik.*` labels from
`docker-compose.yml` and redeploy. The cards keep publishing to the repository,
and only the view counter stops working.

## Operating

```sh
cp .env.example .env          # then fill in GITHUB_TOKEN
docker compose up -d --build
docker compose logs -f
```

Render once without pushing anything, to check output:

```sh
docker compose run --rm cards node src/index.js --once --no-publish
```

Configuration lives in `.env`; `.env.example` documents every variable. The
token needs `read:user` for the contribution calendar and `repo` to read repo
metadata and push the rendered cards.
