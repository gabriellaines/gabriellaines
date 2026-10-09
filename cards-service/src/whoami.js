#!/usr/bin/env node
// Reports who the configured token is and what it can reach. Prints the token's
// scopes and repo visibility counts, never the token itself.
//
//   docker compose run --rm cards node src/whoami.js

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('GITHUB_TOKEN is not set');
  process.exit(2);
}

const res = await fetch('https://api.github.com/user', {
  headers: { Authorization: `bearer ${token}`, 'User-Agent': 'profile-cards-service' },
});

if (!res.ok) {
  console.error(`token rejected: HTTP ${res.status}`);
  process.exit(1);
}

const user = await res.json();
const scopes = res.headers.get('x-oauth-scopes');

console.log(`login:  ${user.login}`);
console.log(`scopes: ${scopes === '' ? '(none - fine-grained or unscoped)' : scopes ?? '(not reported)'}`);

// How many repos the token can actually see, split by visibility. The language
// and stats cards are only as complete as this.
const query = `
query { viewer {
  all: repositories(ownerAffiliations: OWNER, isFork: false) { totalCount }
  publicOnly: repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { totalCount }
} }`;

const gql = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'profile-cards-service',
  },
  body: JSON.stringify({ query }),
});
const payload = await gql.json();

if (payload.data?.viewer) {
  const { all, publicOnly } = payload.data.viewer;
  console.log(`repos visible: ${all.totalCount} (${publicOnly.totalCount} public, ${all.totalCount - publicOnly.totalCount} private)`);
  if (all.totalCount === publicOnly.totalCount) {
    console.log('note: no private repos visible, so language and star totals cover public repos only');
  }
} else {
  console.log(`repos visible: could not determine (${payload.errors?.[0]?.message ?? 'unknown'})`);
}

// What the contribution calendar exposes. The streak and activity cards are
// built from it, so this is the figure that decides whether private activity
// shows up in them.
const to = new Date();
const from = new Date(to.getTime() - 365 * 24 * 3600 * 1000);
const contribQuery = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      restrictedContributionsCount
      contributionCalendar { totalContributions }
    }
  }
}`;

const cg = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'profile-cards-service',
  },
  body: JSON.stringify({
    query: contribQuery,
    variables: { login: user.login, from: from.toISOString(), to: to.toISOString() },
  }),
});
const cgPayload = await cg.json();
const c = cgPayload.data?.user?.contributionsCollection;
if (c) {
  console.log(`last 365d: calendar=${c.contributionCalendar.totalContributions} public commits=${c.totalCommitContributions} private commits=${c.restrictedContributionsCount}`);
  if (c.restrictedContributionsCount === 0) {
    console.log('note: this token reports no private contributions');
  }
}
