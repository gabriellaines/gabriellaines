import { writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import { fetchCore, fetchFullCalendar, fetchRepo } from './github.js';
import {
  statsCard,
  topLangsCard,
  streakCard,
  activityCard,
  pinCard,
  computeStreaks,
  rank,
} from './cards.js';
import { log } from './log.js';

/** Collapses per-repo language edges into one sorted list. */
function aggregateLanguages(repos) {
  const totals = new Map();
  for (const repo of repos) {
    for (const edge of repo.languages?.edges ?? []) {
      const name = edge.node.name;
      const entry = totals.get(name) ?? { name, size: 0, color: edge.node.color };
      entry.size += edge.size;
      totals.set(name, entry);
    }
  }
  return [...totals.values()].sort((a, b) => b.size - a.size);
}

/**
 * Fetches everything once and renders every card. Returns a map of
 * filename -> SVG string. A failure here throws, and the caller decides
 * whether to keep the previously published cards.
 */
export async function renderAll(config) {
  const { token, login } = config;

  log.info('fetching profile data', { login, includePrivate: config.includePrivate });
  const { user, repos } = await fetchCore(token, login, {
    includePrivate: config.includePrivate,
  });
  const name = user.name || user.login;

  const days = await fetchFullCalendar(token, login, user.createdAt);
  log.info('fetched contribution history', { days: days.length });

  const contributions = user.contributionsCollection;
  const stars = repos.reduce((sum, r) => sum + r.stargazerCount, 0);

  // restrictedContributionsCount is the tally of commits to private repos. It
  // names nothing, but it is still a figure derived from private work, so it
  // only counts when private data was asked for.
  const stats = {
    stars,
    commits:
      contributions.totalCommitContributions +
      (config.includePrivate ? contributions.restrictedContributionsCount : 0),
    prs: user.pullRequests.totalCount,
    issues: user.issues.totalCount,
    contributedTo: user.repositoriesContributedTo.totalCount,
  };
  stats.rank = rank({
    commits: stats.commits,
    prs: stats.prs,
    issues: stats.issues,
    stars: stats.stars,
    reviews: contributions.totalPullRequestReviewContributions,
    followers: user.followers.totalCount,
  });

  const streaks = computeStreaks(days);
  const recent = days.slice(-config.activityDays);
  const languages = aggregateLanguages(repos);

  const files = {
    'stats.svg': statsCard({ name, stats }),
    'top-langs.svg': topLangsCard({ languages }),
    'streak.svg': streakCard({ streaks }),
    'activity-graph.svg': activityCard({ name, days: recent }),
  };

  const missing = [];
  for (const repoName of config.pinRepos) {
    const repo = await fetchRepo(token, login, repoName);
    if (!repo) {
      // A pin for a repo that does not exist is a configuration mistake, not a
      // transient failure: skip it rather than publishing an error card.
      missing.push(repoName);
      continue;
    }
    files[`pin-${repoName.toLowerCase()}.svg`] = pinCard({ repo });
  }
  if (missing.length > 0) {
    log.warn('skipped pins for repos that do not exist or are not visible', { missing });
  }

  log.info('rendered cards', { count: Object.keys(files).length });
  return { files, meta: { name, stats, streaks, languages: languages.slice(0, 8), missing } };
}

/** Writes rendered files into outDir, replacing what is there. */
export async function writeFiles(outDir, files) {
  await mkdir(outDir, { recursive: true });
  for (const [filename, svg] of Object.entries(files)) {
    await writeFile(path.join(outDir, filename), svg, 'utf8');
  }
  return readdir(outDir);
}
