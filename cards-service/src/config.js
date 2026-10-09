const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
};

const list = (name, fallback = '') =>
  (process.env[name] ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const num = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
};

export const config = {
  token: required('GITHUB_TOKEN'),
  login: process.env.GITHUB_LOGIN ?? 'gabriellaines',

  // Repos to render pin cards for, in order.
  pinRepos: list('PIN_REPOS'),

  outDir: process.env.OUT_DIR ?? '/data/out',
  stateDir: process.env.STATE_DIR ?? '/data/state',

  // Pushing the rendered cards back into the profile repo.
  publish: bool('PUBLISH', true),
  repoSlug: process.env.REPO_SLUG ?? 'gabriellaines/gabriellaines',
  repoBranch: process.env.REPO_BRANCH ?? 'main',
  repoSubdir: process.env.REPO_SUBDIR ?? 'profile',
  workDir: process.env.WORK_DIR ?? '/data/repo',
  gitName: process.env.GIT_AUTHOR_NAME ?? 'profile-cards',
  gitEmail: process.env.GIT_AUTHOR_EMAIL ?? 'profile-cards@users.noreply.github.com',

  renderIntervalHours: num('RENDER_INTERVAL_HOURS', 6),
  activityDays: num('ACTIVITY_DAYS', 31),

  port: num('PORT', 8080),
  counterEnabled: bool('COUNTER_ENABLED', true),
  // Requests per minute per client for the live endpoints.
  rateLimitPerMinute: num('RATE_LIMIT_PER_MINUTE', 60),
  trustProxy: bool('TRUST_PROXY', true),
};
