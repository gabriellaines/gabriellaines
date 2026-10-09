import { theme, FONT } from './theme.js';

/** Escapes text for use in SVG character data or an attribute value. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const fmt = new Intl.NumberFormat('en-US');

/**
 * Wraps body markup in a card: fixed size, themed background and border, and a
 * title. Everything the renderers emit goes through here so the cards stay
 * visually consistent.
 */
export function card({ width, height, title, body, titleColor = theme.blue }) {
  const titleBlock = title
    ? `<text x="25" y="35" class="title">${esc(title)}</text>`
    : '';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
     fill="none" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="${esc(title ?? 'card')}">
  <title>${esc(title ?? 'card')}</title>
  <style>
    .title { font: 600 18px 'Segoe UI', Ubuntu, sans-serif; fill: ${titleColor}; }
    .label { font: ${FONT}; fill: ${theme.text}; }
    .value { font: 700 14px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.bright}; }
    .small { font: 600 12px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.dim}; }
    .big   { font: 800 28px 'Segoe UI', Ubuntu, sans-serif; fill: ${theme.bright}; }
  </style>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}"
        rx="${theme.radius}" fill="${theme.bg}" stroke="${theme.border}"/>
  ${titleBlock}
  ${body}
</svg>
`;
}

/**
 * Renders a visible failure card. Used only when a card has no previously
 * published copy to keep, so a missing card is never silently blank.
 */
export function errorCard(message) {
  return card({
    width: 480,
    height: 120,
    title: 'Card unavailable',
    titleColor: theme.pink,
    body: `<text x="25" y="68" class="label">${esc(message)}</text>`,
  });
}

/** Builds an SVG path through points, optionally closed into an area. */
export function linePath(points, { close = false, baseline = 0 } = {}) {
  if (points.length === 0) return '';
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(' ');
  if (!close) return d;
  const last = points[points.length - 1];
  const first = points[0];
  return `${d} L${last.x.toFixed(2)},${baseline.toFixed(2)} L${first.x.toFixed(2)},${baseline.toFixed(2)} Z`;
}

/** Chooses a round upper bound for a value axis. */
export function niceMax(value) {
  if (value <= 5) return 5;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}
