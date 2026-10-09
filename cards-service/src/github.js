// Minimal GitHub API client. Uses Node's built-in fetch so the service has no
// npm dependencies at all: nothing to install, no lockfile to drift.

const API = 'https://api.github.com/graphql';

export class GitHubError extends Error {}

async function graphql(token, query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-cards-service',
    },
    body: JSON.stringify({ query, variables }),
  });

  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new GitHubError(`HTTP ${res.status}: non-JSON response ${text.slice(0, 120)}`);
  }

  if (payload.errors?.length) {
    const first = payload.errors[0];
    const type = first.type ? `${first.type}: ` : '';
    throw new GitHubError(`${type}${first.message}`);
  }
  if (!res.ok) throw new GitHubError(`HTTP ${res.status}`);
  if (!payload.data) throw new GitHubError('response carried no data');
  return payload.data;
}

// The same selection, read either through user(login:) or viewer. Via
// user(login:) a token without full `repo` scope sees public repositories only,
// so stars and language sizes cover just those; viewer sees every owned repo.
// Which one to use is a privacy decision, so it is configuration, not a default.
// viewer takes no argument, and GraphQL rejects a declared-but-unused variable,
// so $login is only declared on the branch that reads it.
const coreQuery = (includePrivate) => `
query core(${includePrivate ? '' : '$login: String!, '}$after: String) {
  ${includePrivate ? 'user: viewer' : 'user(login: $login)'} {
    name
    login
    createdAt
    followers { totalCount }
    pullRequests { totalCount }
    issues { totalCount }
    contributionsCollection {
      totalCommitContributions
      restrictedContributionsCount
      totalPullRequestReviewContributions
    }
    repositoriesContributedTo(contributionTypes: [COMMIT, PULL_REQUEST, ISSUE, REPOSITORY]) {
      totalCount
    }
    repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        stargazerCount
        isPrivate
        languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

/** Profile totals plus every owned, non-fork repo with its language sizes. */
export async function fetchCore(token, login, { includePrivate = false } = {}) {
  let after = null;
  let user = null;
  const repos = [];
  const query = coreQuery(includePrivate);

  // repositories() caps at 100 per page, so walk the cursor.
  for (let page = 0; page < 20; page += 1) {
    const data = await graphql(token, query, includePrivate ? { after } : { login, after });
    if (!data.user) throw new GitHubError(`user "${login}" not found`);
    user ??= data.user;
    repos.push(...data.user.repositories.nodes);
    const info = data.user.repositories.pageInfo;
    if (!info.hasNextPage) break;
    after = info.endCursor;
  }

  return { user, repos };
}

const CALENDAR_QUERY = `
query calendar($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date } }
      }
    }
  }
}`;

/** Flat list of { date, count } for a window of at most one year. */
export async function fetchCalendar(token, login, from, to) {
  const data = await graphql(token, CALENDAR_QUERY, {
    login,
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const calendar = data.user?.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new GitHubError('no contribution calendar returned');
  return calendar.weeks
    .flatMap((week) => week.contributionDays)
    .map((day) => ({ date: day.date, count: day.contributionCount }));
}

/**
 * The whole contribution history, stitched together from one-year windows
 * (contributionsCollection refuses a range wider than a year).
 */
export async function fetchFullCalendar(token, login, createdAt) {
  const start = new Date(createdAt);
  const now = new Date();
  const days = [];

  for (let year = start.getUTCFullYear(); year <= now.getUTCFullYear(); year += 1) {
    const from = year === start.getUTCFullYear() ? start : new Date(Date.UTC(year, 0, 1));
    const to = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
    days.push(...(await fetchCalendar(token, login, from, to > now ? now : to)));
  }

  // Windows can overlap at the seams; keep one entry per date.
  const byDate = new Map();
  for (const day of days) byDate.set(day.date, day);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const REPO_QUERY = `
query repo($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name
    nameWithOwner
    description
    stargazerCount
    forkCount
    isPrivate
    isArchived
    primaryLanguage { name color }
  }
}`;

/** One repo's pin data, or null when it does not exist / is not visible. */
export async function fetchRepo(token, owner, name) {
  try {
    const data = await graphql(token, REPO_QUERY, { owner, name });
    return data.repository ?? null;
  } catch (err) {
    if (err instanceof GitHubError && /NOT_FOUND|Could not resolve/i.test(err.message)) {
      return null;
    }
    throw err;
  }
}
