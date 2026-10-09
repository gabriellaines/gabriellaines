#!/usr/bin/env node
// Vendors the README's third-party images into the repo.
//
// Badges, banners and the typing animation are static SVGs: the services that
// serve them re-render the same bytes on every view, so fetching them once and
// committing the result removes a live dependency without changing how the
// README looks. The profile view counter is deliberately left alone, since a
// committed file cannot count views.
//
// Re-run after editing a vendored image's URL in ASSETS below:
//   node tools/vendor-assets.mjs            # fetch and rewrite
//   node tools/vendor-assets.mjs --check    # verify only, no writes

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const README = path.join(ROOT, 'README.md');
const OUT_DIR = path.join(ROOT, 'profile', 'assets');
const OUT_REL = 'profile/assets';

// Hosts whose images are static enough to vendor. komarev.com is intentionally
// absent: it is a counter, so it has to stay live.
const VENDORABLE = [
  'img.shields.io',
  'capsule-render.vercel.app',
  'readme-typing-svg.demolab.com',
];

const slugify = (alt) =>
  alt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'asset';

// Matches ![alt](url), with or without a surrounding [ ... ](link).
const IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;

function collect(markdown) {
  const found = [];
  const seen = new Map();
  for (const match of markdown.matchAll(IMAGE_RE)) {
    const [full, alt, url] = match;
    let host;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    if (!VENDORABLE.includes(host)) continue;

    let slug = slugify(alt);
    // Two different images can share an alt; keep both.
    if (seen.has(slug) && seen.get(slug) !== url) {
      let n = 2;
      while (seen.has(`${slug}-${n}`)) n += 1;
      slug = `${slug}-${n}`;
    }
    seen.set(slug, url);
    found.push({ full, alt, url, host, slug });
  }
  return found;
}

async function fetchSvg(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'gabriellaines-profile-vendor' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (!body.includes('<svg')) {
    throw new Error(`response was not an SVG (${body.slice(0, 60).trim()})`);
  }
  return body;
}

const checkOnly = process.argv.includes('--check');

const markdown = await readFile(README, 'utf8');
const assets = collect(markdown);

if (assets.length === 0) {
  console.log('No vendorable third-party images left in README.md.');
  process.exit(0);
}

console.log(`Found ${assets.length} vendorable image(s):`);
for (const a of assets) console.log(`  ${a.host.padEnd(32)} -> ${OUT_REL}/${a.slug}.svg`);

if (checkOnly) process.exit(0);

await mkdir(OUT_DIR, { recursive: true });

let rewritten = markdown;
let ok = 0;
const failures = [];

for (const asset of assets) {
  try {
    const svg = await fetchSvg(asset.url);
    await writeFile(path.join(OUT_DIR, `${asset.slug}.svg`), svg, 'utf8');
    // Replace this exact image, leaving any surrounding link target intact.
    rewritten = rewritten.replace(
      asset.full,
      `![${asset.alt}](./${OUT_REL}/${asset.slug}.svg)`,
    );
    ok += 1;
    console.log(`  ok   ${asset.slug}.svg (${svg.length} bytes)`);
  } catch (err) {
    failures.push({ asset, err });
    console.error(`  FAIL ${asset.slug}: ${err.message}`);
  }
}

if (failures.length > 0) {
  console.error(
    `\n${failures.length} image(s) could not be fetched. README.md left unchanged ` +
      `so it keeps pointing at the working remote URLs for those.`,
  );
  process.exit(1);
}

await writeFile(README, rewritten, 'utf8');
console.log(`\nVendored ${ok} image(s) and rewrote README.md.`);
