import { theme, series } from './theme.js';
import { card, esc, fmt, linePath, niceMax } from './svg.js';

// ---------------------------------------------------------------- stats card

/**
 * A coarse letter grade. github-readme-stats fits an exponential CDF per
 * metric; this just weights the totals and cuts the result into bands, which
 * is easier to reason about and good enough for a profile badge.
 */
export function rank({ commits, prs, issues, stars, reviews, followers }) {
  const score =
    commits * 1 +
    prs * 3 +
    issues * 2 +
    reviews * 2 +
    stars * 4 +
    followers * 1;

  const bands = [
    [8000, 'S'],
    [4000, 'A+'],
    [2000, 'A'],
    [1000, 'A-'],
    [500, 'B+'],
    [200, 'B'],
    [0, 'C'],
  ];
  const grade = bands.find(([floor]) => score >= floor)[1];
  // Fraction of the way through the current band, for the ring.
  const index = bands.findIndex(([, g]) => g === grade);
  const floor = bands[index][0];
  const ceiling = index === 0 ? floor * 2 : bands[index - 1][0];
  const progress = ceiling > floor ? Math.min(1, (score - floor) / (ceiling - floor)) : 1;
  return { grade, score, progress };
}

const ICONS = {
  star: 'M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z',
  commit:
    'M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43-.75a4 4 0 00-7.86 0H1.75a.75.75 0 100 1.5h2.32a4 4 0 007.86 0h2.32a.75.75 0 100-1.5h-2.32z',
  pr: 'M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25z',
  issue:
    'M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z',
  repo: 'M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9z',
};

export function statsCard({ name, stats }) {
  const rows = [
    ['star', 'Total Stars Earned', stats.stars],
    ['commit', 'Total Commits (last year)', stats.commits],
    ['pr', 'Total PRs', stats.prs],
    ['issue', 'Total Issues', stats.issues],
    ['repo', 'Contributed to (last year)', stats.contributedTo],
  ];

  const body = rows
    .map(([icon, label, value], i) => {
      const y = i * 25;
      return `<g transform="translate(25, ${60 + y})">
      <svg viewBox="0 0 16 16" width="16" height="16" y="-12" fill="${theme.purple}">
        <path d="${ICONS[icon]}"/></svg>
      <text x="25" y="0" class="label">${esc(label)}:</text>
      <text x="300" y="0" class="value">${fmt.format(value)}</text>
    </g>`;
    })
    .join('\n');

  const r = 40;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - stats.rank.progress);

  const ring = `<g transform="translate(400, 105)">
    <circle r="${r}" fill="none" stroke="${theme.blue}" stroke-width="6" opacity="0.2"/>
    <circle r="${r}" fill="none" stroke="${theme.blue}" stroke-width="6"
            stroke-linecap="round" opacity="0.9"
            stroke-dasharray="${circumference.toFixed(2)}"
            stroke-dashoffset="${offset.toFixed(2)}"
            transform="rotate(-90)"/>
    <text text-anchor="middle" dominant-baseline="central" class="big">${esc(stats.rank.grade)}</text>
  </g>`;

  return card({
    width: 467,
    height: 195,
    title: `${name}'s GitHub Stats`,
    body: `${body}\n${ring}`,
  });
}

// ------------------------------------------------------------ top languages

export function topLangsCard({ languages, count = 8 }) {
  const top = languages.slice(0, count);
  const total = top.reduce((sum, l) => sum + l.size, 0) || 1;
  const width = 340;
  const barWidth = width - 50;

  let offset = 0;
  const bar = top
    .map((lang, i) => {
      const w = (lang.size / total) * barWidth;
      const rect = `<rect x="${offset.toFixed(2)}" y="0" width="${Math.max(w, 0).toFixed(2)}"
        height="8" fill="${lang.color || series[i % series.length]}"/>`;
      offset += w;
      return rect;
    })
    .join('');

  const legend = top
    .map((lang, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const share = ((lang.size / total) * 100).toFixed(1);
      return `<g transform="translate(${col * 150}, ${row * 22})">
      <circle cx="5" cy="-4" r="5" fill="${lang.color || series[i % series.length]}"/>
      <text x="16" y="0" class="label">${esc(lang.name)}</text>
      <text x="100" y="0" class="small">${share}%</text>
    </g>`;
    })
    .join('\n');

  const rows = Math.ceil(top.length / 2);
  const height = 90 + rows * 22;

  return card({
    width,
    height,
    title: 'Most Used Languages',
    body: `<g transform="translate(25, 55)">
      <clipPath id="barClip">
        <rect x="0" y="0" width="${barWidth}" height="8" rx="4"/>
      </clipPath>
      <g clip-path="url(#barClip)">${bar}</g>
    </g>
    <g transform="translate(25, 90)">${legend}</g>`,
  });
}

// --------------------------------------------------------------- streak card

/** Total, current and longest contribution streaks from a full day list. */
export function computeStreaks(days) {
  const total = days.reduce((sum, d) => sum + d.count, 0);
  const today = new Date().toISOString().slice(0, 10);

  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null, end: null };

  for (const day of days) {
    if (day.count > 0) {
      run.length += 1;
      run.start ??= day.date;
      run.end = day.date;
      if (run.length > longest.length) longest = { ...run };
    } else {
      run = { length: 0, start: null, end: null };
    }
  }

  // The current streak is the trailing run. A zero-contribution today does not
  // break it yet, since the day is not over.
  let current = { length: 0, start: null, end: null };
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day.count === 0) {
      if (day.date === today) continue;
      break;
    }
    current.length += 1;
    current.start = day.date;
    current.end ??= day.date;
  }

  return { total, current, longest, first: days[0]?.date ?? null };
}

/** "Jun 9" for dates in the current year, "Jun 9, 2023" otherwise. */
const monthDay = (iso) => {
  if (!iso) return '—';
  const date = new Date(`${iso}T00:00:00Z`);
  const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
};

export function streakCard({ streaks }) {
  const width = 495;
  const height = 195;
  const columns = [
    {
      value: fmt.format(streaks.total),
      label: 'Total Contributions',
      sub: `${monthDay(streaks.first)} – Present`,
      color: theme.bright,
    },
    {
      value: fmt.format(streaks.current.length),
      label: 'Current Streak',
      sub:
        streaks.current.length > 0
          ? `${monthDay(streaks.current.start)} – ${monthDay(streaks.current.end)}`
          : 'No active streak',
      color: theme.purple,
      highlight: true,
    },
    {
      value: fmt.format(streaks.longest.length),
      label: 'Longest Streak',
      sub:
        streaks.longest.length > 0
          ? `${monthDay(streaks.longest.start)} – ${monthDay(streaks.longest.end)}`
          : '—',
      color: theme.bright,
    },
  ];

  const body = columns
    .map((col, i) => {
      const cx = (width / 3) * i + width / 6;
      const ring = col.highlight
        ? `<circle cx="0" cy="-4" r="38" fill="none" stroke="${theme.blue}" stroke-width="2" opacity="0.5"/>`
        : '';
      return `<g transform="translate(${cx}, 86)" text-anchor="middle">
      ${ring}
      <text y="0" style="font: 800 28px 'Segoe UI', Ubuntu, sans-serif; fill: ${col.color}">${col.value}</text>
      <text y="28" class="label">${esc(col.label)}</text>
      <text y="50" class="small">${esc(col.sub)}</text>
    </g>`;
    })
    .join('\n');

  const dividers = [1, 2]
    .map(
      (i) =>
        `<line x1="${(width / 3) * i}" y1="45" x2="${(width / 3) * i}" y2="${height - 25}"
           stroke="${theme.border}" stroke-width="1"/>`,
    )
    .join('');

  return card({
    width,
    height,
    title: 'Contribution Streak',
    body: `${dividers}\n${body}`,
  });
}

// ------------------------------------------------------------- activity graph

export function activityCard({ name, days }) {
  const width = 1200;
  const height = 420;
  const pad = { top: 70, right: 40, bottom: 60, left: 70 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxCount = Math.max(1, ...days.map((d) => d.count));
  const yMax = niceMax(maxCount);

  const x = (i) => pad.left + (days.length <= 1 ? 0 : (i / (days.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;

  const points = days.map((d, i) => ({ x: x(i), y: y(d.count) }));

  const ticks = 5;
  const yAxis = Array.from({ length: ticks + 1 }, (_, i) => {
    const value = (yMax / ticks) * i;
    const yy = y(value);
    return `<line x1="${pad.left}" y1="${yy.toFixed(2)}" x2="${pad.left + plotW}" y2="${yy.toFixed(2)}"
        stroke="${theme.border}" stroke-width="1" opacity="0.5"/>
      <text x="${pad.left - 14}" y="${(yy + 4).toFixed(2)}" text-anchor="end" class="small">${value}</text>`;
  }).join('\n');

  // Label roughly every fifth day so the axis stays readable at 31 points.
  const stride = Math.max(1, Math.round(days.length / 8));
  const xAxis = days
    .map((d, i) => {
      if (i % stride !== 0 && i !== days.length - 1) return '';
      const label = new Date(`${d.date}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      return `<text x="${x(i).toFixed(2)}" y="${pad.top + plotH + 28}" text-anchor="middle" class="small">${label}</text>`;
    })
    .join('');

  const dots = points
    .map((p) => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4" fill="${theme.pink}"/>`)
    .join('');

  const body = `
  <defs>
    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${theme.blue}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${theme.blue}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${yAxis}
  ${xAxis}
  <path d="${linePath(points, { close: true, baseline: pad.top + plotH })}" fill="url(#areaFill)"/>
  <path d="${linePath(points)}" fill="none" stroke="${theme.purple}" stroke-width="3"
        stroke-linejoin="round" stroke-linecap="round"/>
  ${dots}
  <text x="${width - pad.right}" y="35" text-anchor="end" class="small">last ${days.length} days</text>`;

  return card({
    width,
    height,
    title: `${name}'s Contribution Graph`,
    body,
  });
}

// ------------------------------------------------------------------ pin card

export function pinCard({ repo }) {
  const width = 400;
  const height = 120;
  const description = (repo.description ?? 'No description').slice(0, 120);

  const meta = [];
  if (repo.primaryLanguage) {
    meta.push(
      `<circle cx="6" cy="-4" r="6" fill="${repo.primaryLanguage.color || theme.blue}"/>
       <text x="18" y="0" class="small">${esc(repo.primaryLanguage.name)}</text>`,
    );
  }
  if (repo.stargazerCount > 0) {
    meta.push(
      `<g transform="translate(${repo.primaryLanguage ? 110 : 0}, 0)">
         <svg viewBox="0 0 16 16" width="13" height="13" y="-11" fill="${theme.dim}">
           <path d="${ICONS.star}"/></svg>
         <text x="18" y="0" class="small">${fmt.format(repo.stargazerCount)}</text>
       </g>`,
    );
  }

  return card({
    width,
    height,
    title: repo.name,
    body: `<text x="25" y="62" class="label">${esc(description)}</text>
    <g transform="translate(25, 95)">${meta.join('\n')}</g>`,
  });
}

// -------------------------------------------------------------- view counter

export function counterCard({ count, label = 'PROFILE VIEWS' }) {
  const text = fmt.format(count);
  // for-the-badge styling, to match the vendored shields badges beside it.
  const labelW = 11 + label.length * 8.4;
  const valueW = 24 + text.length * 9;
  const width = labelW + valueW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(0)}" height="28"
     role="img" aria-label="${esc(label)}: ${text}">
  <title>${esc(label)}: ${text}</title>
  <g shape-rendering="crispEdges">
    <rect width="${labelW.toFixed(0)}" height="28" fill="${theme.bg}"/>
    <rect x="${labelW.toFixed(0)}" width="${valueW.toFixed(0)}" height="28" fill="${theme.bg}"/>
  </g>
  <g fill="#fff" text-anchor="middle"
     font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="100"
     text-rendering="geometricPrecision">
    <text transform="scale(.1)" x="${(labelW * 5).toFixed(0)}" y="175"
          textLength="${((labelW - 20) * 10).toFixed(0)}" fill="${theme.text}"
          font-weight="bold">${esc(label)}</text>
    <text transform="scale(.1)" x="${((labelW + valueW / 2) * 10).toFixed(0)}" y="175"
          textLength="${((valueW - 24) * 10).toFixed(0)}" fill="${theme.blue}"
          font-weight="bold">${text}</text>
  </g>
</svg>
`;
}
